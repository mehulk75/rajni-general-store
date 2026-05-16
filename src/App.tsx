import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { type Product, type CartItem } from './data'; // Import CartItem

const PRODUCTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFeyX4ZGUI7LWLOETHwWYwEqCIlxAodMX1gE7zgdtOinZuuvfLEsbLGGDtcruU7LEGtyg92ZFFn5Ka/pub?gid=0&single=true&output=csv";
const SETTINGS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRFeyX4ZGUI7LWLOETHwWYwEqCIlxAodMX1gE7zgdtOinZuuvfLEsbLGGDtcruU7LEGtyg92ZFFn5Ka/pub?gid=113796128&single=true&output=csv";

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

  const sendWhatsAppOrder = () => { // Renamed from handleCheckout
    const phoneNumber = '+919835978626'; // Placeholder phone number
    let message = `*Pickup Time: ${pickupTime}*\n\n`; // Add pickup time prominently
    message += 'My Order from Rajni General Store:\n\n';

    cart.forEach((item, index) => {
      message += `${index + 1}. ${item.name} x ${item.quantity} - ₹${item.price * item.quantity}\n`;
    });

    message += `\nTotal: ₹${totalPrice}`;

    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setIsCartModalOpen(false); // Close modal after sending order
  };

  const handleUploadList = () => {
    const phoneNumber = '+919835978626'; // Placeholder phone number (ensure consistent format)
    const message = "Hi, I have a handwritten grocery list. I will attach the photo below. Please let me know when it is packed!";
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Available Products</h2>

        {/* Pickup Time Selector */}
        {Object.keys(settings).length > 0 && storeStatus !== 'LOADING' && (
          <div className="mb-4 p-3 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center space-x-2">
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
        )}

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
                .filter(product => selectedCategory === 'All' || product.category === selectedCategory)
                .map((product) => (
                  <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
                    <div className="text-4xl mb-2">{product.image}</div>
                    <h3 className="font-medium text-gray-800 text-sm mb-1 line-clamp-2 h-10">{product.name}</h3>
                    
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
