import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency: 'HUF',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function translateError(error: any): string {
  const message = error?.message || String(error);
  
  if (message.includes('permission-denied') || message.includes('insufficient permissions')) {
    return 'Nincs jogosultsága a művelet végrehajtásához.';
  }
  if (message.includes('offline')) {
    return 'Úgy tűnik, nincs internetkapcsolat. Ellenőrizze a hálózatot!';
  }
  if (message.includes('quota-exceeded')) {
    return 'A napi adatforgalmi keret elfogyott. Próbálja újra holnap!';
  }
  if (message.includes('not-found')) {
    return 'A kért adat nem található.';
  }
  if (message.includes('already-exists')) {
    return 'Ez az adat már létezik a rendszerben.';
  }
  if (message.includes('unauthenticated')) {
    return 'Kérjük, jelentkezzen be újra!';
  }
  
  return 'Váratlan hiba történt. Kérjük, próbálja újra később!';
}
