import { Stack } from 'expo-router';
import { ProductForm } from '@/components/inventory/product-form';

/** New product (web: Products → New product). For a lens, choose a lens category and make its powers in one go. */
export default function NewProduct() {
  return <><Stack.Screen options={{ title: 'New product' }} /><ProductForm /></>;
}
