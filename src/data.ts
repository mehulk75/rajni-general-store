export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number; // Useful for showing discounts on bundles
  category: string;
  image: string;
}

export const products: Product[] = [
  {
    id: "b1",
    name: "Morning Breakfast Bundle (Milk + Bread + Eggs)",
    price: 95,
    originalPrice: 110,
    category: "Bundles",
    image: "🍞" // Using emojis as placeholders for now
  },
  {
    id: "p1",
    name: "Fresh Milk (1L)",
    price: 32,
    category: "Dairy",
    image: "🥛"
  },
  {
    id: "p2",
    name: "Fresh Curd (500g)",
    price: 38,
    category: "Dairy",
    image: "🥣"
  },
  {
    id: "p3",
    name: "Atta (5kg)",
    price: 210,
    category: "Groceries",
    image: "🌾"
  }
];