import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { type Product, type CartItem } from './data'; // Import CartItem

const PRODUCTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFeyX4ZGUI7LWLOETHwWYwEqCIlxAodMX1gE7zgdtOinZuuvfLEsbLGGDtcruU7LEGtyg92ZFFn5Ka/pub?gid=0&single=true&output=csv";
const SETTINGS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFeyX4ZGUI7LWLOETHwWYwEqCIlxAodMX1gE7zgdtOinZuuvfLEsbLGGDtcruU7LEGtyg92ZFFn5Ka/pub?gid=113796128&single=true&output=csv";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzi_Z6sZ6WR8R7oJoVbS4TirK1v_cpD4tLrCgxXeSLzNOt7fCQVIQYoYuAkkRH0XfqqRQ/exec";

// Helper function to parse time strings like "7:00 AM" into total minutes from midnight
const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return -1; // Indicate invalid time

  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0; // Midnight
  }
  return hours * 60 + minutes;
};

// Helper function to convert total minutes from midnight back into a 12-hour formatted string
const formatMinutesToTime = (totalMinutes: number): string => {
  if (totalMinutes === -1) return "N/A"; // Handle invalid time

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;

  return `${formattedHours}:${formattedMinutes} ${ampm}`;
};

class TrieNode {
  children: Record<string, TrieNode> = {};
  isEndOfWord: boolean = false;
  words: Set<string> = new Set();
}

class Trie {
  root: TrieNode = new TrieNode();

  insert(wordToIndex: string, fullProductName: string) {
    let node = this.root;
    for (const char of wordToIndex.toLowerCase()) {
      if (!node.children[char]) node.children[char] = new TrieNode();
      node = node.children[char];
      node.words.add(fullProductName);
    }
    node.isEndOfWord = true;
  }

  searchPrefix(prefix: string): string[] {
    let node = this.root;
    for (const char of prefix.toLowerCase()) {
      if (!node.children[char]) return [];
      node = node.children[char];
    }
    return Array.from(node.words);
  }
}


function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]); // Cart now stores CartItem[]
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isCartModalOpen, setIsCartModalOpen] = useState(false); // New state for modal
  const [settings, setSettings] = useState<Record<string, string>>({}); // New state for settings
  const [pickupTime, setPickupTime] = useState<string>("As soon as possible (15-20 mins)"); // New state for pickup time
  const [storeStatus, setStoreStatus] = useState<'LOADING' | 'OPEN' | 'LUNCH_BREAK' | 'CLOSED_NIGHT'>('LOADING');
  const [pickupOptions, setPickupOptions] = useState<string[]>([]); // New state for dynamic pickup options
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null); // New state for product details modal
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTrie, setSearchTrie] = useState<Trie | null>(null);

  const categories = ['All', ...new Set(products.map(p => p.category))];

  useEffect(() => {
    setLoading(true);

    const fetchProducts = new Promise<Product[]>((resolve, reject) => {
      Papa.parse(PRODUCTS_CSV_URL, {
        download: true,
        header: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const parsedProducts: Product[] = results.data
            .filter((item: any) => item.id && item.name && item.price && item.category && item.image) // Ensure all required fields exist
            .map((item: any) => ({
              id: item.id,
              name: item.name,
              price: parseFloat(item.price),
              originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : undefined,
              category: item.category,
              image: item.image,
            }));
          resolve(parsedProducts);
        },
        error: (error: Error) => {
          console.error("Error fetching or parsing products CSV:", error);
          reject(error);
        }
      });
    });

    const fetchSettings = new Promise<Record<string, string>>((resolve, reject) => {
      Papa.parse(SETTINGS_CSV_URL, {
        download: true,
        header: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const parsedSettings: Record<string, string> = {};
          (results.data as { key: string; value: string }[]).forEach(row => {
            if (row.key && row.value) {
              parsedSettings[row.key] = row.value;
            }
          });
          resolve(parsedSettings);
        },
        error: (error: Error) => {
          console.error("Error fetching or parsing settings CSV:", error);
          reject(error);
        }
      });
    });

    Promise.all([fetchProducts, fetchSettings])
      .then(([productsData, settingsData]) => {
        setProducts(productsData);
        setSettings(settingsData);
        setLoading(false);

        // Build Trie asynchronously
        setTimeout(() => {
          const trie = new Trie();
          productsData.forEach(p => {
            trie.insert(p.name, p.name);
            p.name.split(" ").forEach(word => trie.insert(word, p.name));
            trie.insert(p.category, p.name);
          });
          setSearchTrie(trie);
        }, 0);

      })
      .catch((error) => {
        console.error("Failed to fetch all data:", error);
        setLoading(false);
      });
  }, []);

  // Effect to calculate store status in real-time
  useEffect(() => {
    if (Object.keys(settings).length === 0) {
      setStoreStatus('LOADING');
      return;
    }

    const updateStatus = () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const openTime = parseTimeToMinutes(settings.shop_open_time);
      const closeTime = parseTimeToMinutes(settings.shop_close_time);
      const breakStartTime = parseTimeToMinutes(settings.break_start_time);
      const breakEndTime = parseTimeToMinutes(settings.break_end_time);

      let options: string[] = [];
      let currentCalculatedStatus: typeof storeStatus = 'LOADING';

      if (currentMinutes >= breakStartTime && currentMinutes < breakEndTime) {
        currentCalculatedStatus = 'LUNCH_BREAK';
        options = [
          `Right after lunch (Ready at ${settings.break_end_time})`,
          `Evening slot (${settings.break_end_time} - ${settings.shop_close_time})`
        ];
      } else if (currentMinutes < openTime || currentMinutes >= closeTime) {
        currentCalculatedStatus = 'CLOSED_NIGHT';
        options = [
          `Tomorrow morning (${settings.shop_open_time} - ${formatMinutesToTime(openTime + 120)})`,
          `Tomorrow afternoon (12:00 PM - ${settings.break_start_time})`,
          `Tomorrow evening (${settings.break_end_time} - ${settings.shop_close_time})`
        ];
      } else {
        currentCalculatedStatus = 'OPEN';
        options = [
          "Immediately (10-15 mins)",
          "In about 1 hour",
        ];
        if (currentMinutes + 60 < breakStartTime) {
          options.push(`Today (${formatMinutesToTime(currentMinutes + 60)} - ${settings.break_start_time})`);
        }
        options.push(`Evening (${settings.break_end_time} - ${settings.shop_close_time})`);
      }

      setStoreStatus(currentCalculatedStatus);
      setPickupOptions(options);
      if (options.length > 0) {
        setPickupTime(options[0]); // Set default to the first available option
      }
    };

    updateStatus(); // Initial status calculation

    const intervalId = setInterval(updateStatus, 60 * 1000); // Update every minute

    return () => clearInterval(intervalId); // Cleanup interval on unmount
  }, [settings]);


  const addToCart = (product: Product) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prevCart, { ...product, quantity: 1 }];
      }
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        );
      } else {
        return prevCart.filter((item) => item.id !== productId);
      }
    });
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const sendWhatsAppOrder = () => { 
    const phoneNumber = '+919835978626'; // Placeholder phone number
    
    // --- 1. GENERATE UNIQUE ORDER ID ---
    const orderId = "ORD-" + Date.now();

    // --- 2. SILENTLY LOG TO GOOGLE SHEETS (ASYNC) ---
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderId,
        cart: cart,
        pickupTime: pickupTime
      })
    }).catch(err => console.error("Async logging failed:", err));

    // --- 3. BUILD AND OPEN WHATSAPP IMMEDIATELY ---
    let message = `*Pickup Time: ${pickupTime}*\n\n`; 
    message += 'My Order from Rajni General Store:\n\n';

    cart.forEach((item, index) => {
      message += `${index + 1}. ${item.name} x ${item.quantity} - ₹${item.price * item.quantity}\n`;
    });

    message += `\nTotal: ₹${totalPrice}`;

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setIsCartModalOpen(false);
  };

  const handleUploadList = () => {
    const phoneNumber = '+919835978626'; // Placeholder phone number (ensure consistent format)
    const message = "Hi, I have a handwritten grocery list. I will attach the photo below. Please let me know when it is packed!";
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 0 && searchTrie) {
      setSuggestions(searchTrie.searchPrefix(query).slice(0, 5));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header & Banner */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-green-700">Rajni General Store</h1>
        </div>
        
        {/* The dynamic Promo Banner */}
        {storeStatus === 'LUNCH_BREAK' && settings.break_end_time && (
          <div className="bg-yellow-100 p-3 text-sm text-yellow-800 text-center font-medium border-b border-yellow-200">
            🕒 Shop closed for lunch. Orders placed now will be ready at {settings.break_end_time}.
          </div>
        )}
        {storeStatus === 'CLOSED_NIGHT' && settings.shop_open_time && (
          <div className="bg-blue-100 p-3 text-sm text-blue-800 text-center font-medium border-b border-blue-200">
            🌙 Shop is closed for the night. Orders placed now will be ready tomorrow at {settings.shop_open_time}.
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-md mx-auto">

        {/* Pickup Time Selector */}
        {Object.keys(settings).length > 0 && storeStatus !== 'LOADING' && (
          <div className="mb-6"> {/* Added wrapper div with margin-bottom */}
            <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Choose your preferred pickup slot</h3>
            <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center space-x-2">
              <span className="text-xl">🕒</span>
              <select
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700"
              >
                {pickupOptions.map((option, index) => (
                  <option key={index} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Search Bar with Autocomplete */}
        <div className="mb-4 relative z-20">
          <div className="flex items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
            <span className="text-gray-400 mr-2 text-lg">🔍</span>
            <input
              type="text"
              placeholder="Search for groceries..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => { if (searchQuery.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="flex-1 focus:outline-none text-gray-700 bg-transparent"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSuggestions([]); }} className="text-gray-400 hover:text-gray-600 font-bold ml-2">✕</button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
              {suggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  onClick={() => { setSearchQuery(suggestion); setShowSuggestions(false); }}
                  className="px-4 py-3 cursor-pointer hover:bg-gray-50 text-gray-700 border-b border-gray-50 last:border-b-0"
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-center text-gray-600 text-lg mt-8">Loading products...</p>
        ) : (
          <>
            {/* Category Filters */}
            <div className="flex space-x-2 pb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ease-in-out ${
                    selectedCategory === category
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 gap-4">
              {products
                .filter(product => (selectedCategory === 'All' || product.category === selectedCategory) && (!searchQuery || product.name.toLowerCase().includes(searchQuery.toLowerCase()) || product.category.toLowerCase().includes(searchQuery.toLowerCase())))
                .map((product) => (
                  <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center h-full">
                    
                    <div onClick={() => setSelectedProduct(product)} className="cursor-pointer w-full flex flex-col items-center flex-grow"> {/* Added flex-grow */}
                      {/* Fixed Height Image/Emoji Container */}
                      <div className="w-full h-24 flex items-center justify-center mb-2">
                        {product.image.startsWith('http') ? (
                          <img 
                            src={product.image} 
                            alt={product.name} 
                            className="w-16 h-16 object-contain mb-2" 
                            loading="lazy" 
                          />
                        ) : (
                          <div className="text-5xl">{product.image}</div>
                        )}
                      </div>
                      
                      <h3 className="font-medium text-gray-800 text-sm mb-1 line-clamp-2 h-10">{product.name}</h3>
                    </div>
                    
                    {/* mt-auto pushes the price and button to the absolute bottom */}
                    <div className="mt-auto w-full">
                      <div className="mb-3">
                        <span className="font-bold text-green-600">₹{product.price}</span>
                        {product.originalPrice && (
                          <span className="text-xs text-gray-400 line-through ml-2">₹{product.originalPrice}</span>
                        )}
                      </div>
                      
                      {(() => {
                        const cartItem = cart.find((item) => item.id === product.id);
                        const currentQuantity = cartItem ? cartItem.quantity : 0;

                        if (currentQuantity === 0) {
                          return (
                            <button 
                              onClick={() => addToCart(product)}
                              className="w-full bg-blue-50 text-blue-600 font-semibold py-2 rounded-lg text-sm hover:bg-blue-100 transition-colors"
                            >
                              Add to Cart
                            </button>
                          );
                        } else {
                          return (
                            <div className="flex items-center justify-center w-full bg-green-50 border border-green-300 rounded-lg text-green-700 font-semibold text-sm">
                              <button
                                onClick={() => removeFromCart(product.id)}
                                className="py-2 px-3 focus:outline-none text-lg"
                              >
                                -
                              </button>
                              <span className="flex-1 text-center py-2 border-x border-green-200">
                                {currentQuantity}
                              </span>
                              <button
                                onClick={() => addToCart(product)}
                                className="py-2 px-3 focus:outline-none text-lg"
                              >
                                +
                              </button>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Upload List Section Placeholder */}
        <div className="mt-8 bg-blue-600 text-white p-6 rounded-xl text-center shadow-md">
          <h3 className="font-bold text-lg mb-2">Have a handwritten list?</h3>
          <p className="text-sm text-blue-100 mb-4">Don't want to search? Just upload a photo of your list and we'll pack it.</p>
          <button
            onClick={handleUploadList}
            className="bg-white text-blue-600 font-bold py-2 px-6 rounded-full shadow-sm"
          >
            📷 Upload List
          </button>
        </div>
      </main>

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-semibold"
            >
              &times;
            </button>

            <div className="flex flex-col items-center">
              {/* Product Image/Emoji */}
              <div className="w-48 h-48 flex items-center justify-center mb-4">
                {selectedProduct.image.startsWith('http') ? (
                  <img 
                    src={selectedProduct.image} 
                    alt={selectedProduct.name} 
                    className="max-h-full max-w-full object-contain drop-shadow-sm" 
                  />
                ) : (
                  <div className="text-7xl">{selectedProduct.image}</div>
                )}
              </div>

              <h2 className="text-xl font-bold text-gray-800 mt-4 mb-2 text-center">{selectedProduct.name}</h2>
              
              <div className="mb-4">
                <span className="font-bold text-green-600 text-lg">₹{selectedProduct.price}</span>
                {selectedProduct.originalPrice && (
                  <span className="text-sm text-gray-400 line-through ml-2">₹{selectedProduct.originalPrice}</span>
                )}
              </div>

              {/* Add to Cart / Quantity Selector for Modal */}
              {(() => {
                const cartItem = cart.find((item) => item.id === selectedProduct.id);
                const currentQuantity = cartItem ? cartItem.quantity : 0;

                if (currentQuantity === 0) {
                  return (
                    <button 
                      onClick={() => addToCart(selectedProduct)}
                      className="w-full bg-blue-50 text-blue-600 font-semibold py-3 rounded-lg text-base hover:bg-blue-100 transition-colors"
                    >
                      Add to Cart
                    </button>
                  );
                } else {
                  return (
                    <div className="flex items-center justify-center w-full bg-green-50 border border-green-300 rounded-lg text-green-700 font-semibold text-base">
                      <button
                        onClick={() => removeFromCart(selectedProduct.id)}
                        className="py-2 px-4 focus:outline-none text-xl"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center py-2 border-x border-green-200">
                        {currentQuantity}
                      </span>
                      <button
                        onClick={() => addToCart(selectedProduct)}
                        className="py-2 px-4 focus:outline-none text-xl"
                      >
                        +
                      </button>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart Footer */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Total Items</p>
              <p className="font-bold text-lg">{cart.length} items (₹{totalPrice})</p>
            </div>
            <button
              onClick={() => setIsCartModalOpen(true)} // Open modal instead of direct checkout
              className="bg-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-md flex items-center gap-2"
            >
              <span>Checkout</span>
              <span className="text-xl">💬</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart Review Modal */}
      {isCartModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex justify-center items-end" onClick={() => setIsCartModalOpen(false)}>
          <div
            className="fixed bottom-0 w-full max-w-md bg-white rounded-t-2xl p-4 z-50 shadow-lg"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Cart</h2>
              <button onClick={() => setIsCartModalOpen(false)} className="text-gray-500 hover:text-gray-700 text-2xl font-semibold">
                &times;
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="text-gray-600 text-center py-8">Your cart is empty.</p>
            ) : (
              <>
                <div className="max-h-80 overflow-y-auto mb-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{item.name}</p>
                        <p className="text-sm text-gray-500">₹{item.price} per item</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="bg-gray-200 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold"
                        >
                          -
                        </button>
                        <span className="font-bold text-gray-800 w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="ml-4 font-bold text-gray-800 w-16 text-right">
                        ₹{item.price * item.quantity}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                  <span className="text-lg font-bold text-gray-800">Grand Total:</span>
                  <span className="text-xl font-bold text-green-600">₹{totalPrice}</span>
                </div>

                {/* Price Disclaimer */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">ℹ️</span>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    <strong>Note:</strong> The final bill amount may vary slightly. Papa might apply special store discounts at the counter, or prices may be updated based on the latest MRP.
                  </p>
                </div>

                <button
                  onClick={sendWhatsAppOrder} // New button for WhatsApp order
                  className="w-full bg-green-600 text-white font-bold py-3 mt-6 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  <span>Send Order via WhatsApp</span>
                  <span className="text-xl">💬</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
