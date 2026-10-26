import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Examen de Matemáticas · 4.º',
  description: 'Examen final interactivo de matemáticas para cuarto grado.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
