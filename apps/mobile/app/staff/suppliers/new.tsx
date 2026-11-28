import { Stack } from 'expo-router';
import { SupplierForm } from '@/components/inventory/supplier-form';

/** New supplier (web: Suppliers → New supplier). */
export default function NewSupplier() {
  return <><Stack.Screen options={{ title: 'New supplier' }} /><SupplierForm /></>;
}
