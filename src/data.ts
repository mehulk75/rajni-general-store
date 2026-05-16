export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number; // Useful for showing discounts on bundles
  category: string;
  image: string;
}

