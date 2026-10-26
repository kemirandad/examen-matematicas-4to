import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Examen final de matemáticas · 4.º',
  description: 'Evaluación interactiva de números decimales para cuarto grado de la I.E.D. San Francisco Javier.',
};

export default function MathExamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
