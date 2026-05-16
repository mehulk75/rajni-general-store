import { useState } from 'react';
import { products, type Product } from './data';

function App() {
  const [cart, setCart] = useState<Product[]>([]);

  const addToCart = (product: Product) => {
    setCart([...cart, product]);
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = () => {
    const phoneNumber = '+919999999999'; // Placeholder phone number
    let message = 'My Order from Rajni General Store:\n\n';

    cart.forEach((item, index) => {
      message += `${index + 1}. ${item.name} - ₹${item.price}\n`;
    });

    message += `\nTotal: ₹${totalPrice}`;

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
        
        {/* The Lunch Break Promo Banner */}
        <div className="bg-yellow-100 p-3 text-sm text-yellow-800 text-center font-medium border-b border-yellow-200">
          🕒 Shop closed for lunch? Order online now and your bags will be packed and ready for pickup at 4:00 PM!
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-md mx-auto">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Available Products</h2>
        
        {/* Product Grid */}
        <div className="grid grid-cols-2 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <div className="text-4xl mb-2">{product.image}</div>
              <h3 className="font-medium text-gray-800 text-sm mb-1 line-clamp-2 h-10">{product.name}</h3>
              
              <div className="mb-3">
                <span className="font-bold text-green-600">₹{product.price}</span>
                {product.originalPrice && (
                  <span className="text-xs text-gray-400 line-through ml-2">₹{product.originalPrice}</span>
                )}
              </div>
              
              <button 
                onClick={() => addToCart(product)}
                className="w-full bg-blue-50 text-blue-600 font-semibold py-2 rounded-lg text-sm hover:bg-blue-100 transition-colors"
              >
                Add to Cart
              </button>
            </div>
          ))}
        </div>

        {/* Upload List Section Placeholder */}
        <div className="mt-8 bg-blue-600 text-white p-6 rounded-xl text-center shadow-md">
          <h3 className="font-bold text-lg mb-2">Have a handwritten list?</h3>
          <p className="text-sm text-blue-100 mb-4">Don't want to search? Just upload a photo of your list and we'll pack it.</p>
          <button className="bg-white text-blue-600 font-bold py-2 px-6 rounded-full shadow-sm">
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
              onClick={handleCheckout}
              className="bg-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-md flex items-center gap-2"
            >
              <span>Checkout</span>
              <span className="text-xl">💬</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
