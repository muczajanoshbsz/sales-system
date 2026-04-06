import { AppConfig } from './types';

export const APP_CONFIG: AppConfig = {
  models: ["AirPods 2", "AirPods 3", "AirPods 4 ANC", "AirPods Pro", "AirPods Pro 2", "AirPods Pro 3", "AirPods Max", "JBL Pulse 5", "Egyéb"],
  conditions: ["bontatlan", "bontott", "felújított"],
  platforms: ["Vinted", "Jófogás", "Vatera", "Aukro", "Személyes", "Egyéb"],
  thresholds: {
    low_stock: 5,
    critical_stock: 2
  }
};

export const PLATFORM_MARGINS: Record<string, number> = {
  "Vatera": 1.15,
  "Vinted": 1.15,
  "Aukro": 1.15,
  "Jófogás": 1.15,
  "Személyes": 1.10,
  "Egyéb": 1.15
};

export const SEASONAL_ADJUSTMENTS: Record<number, number> = {
  1: 1.05,   // Január
  2: 0.95,   // Február
  3: 1.00,   // Március
  4: 1.10,   // Április
  5: 1.05,   // Május
  6: 0.90,   // Június
  7: 0.85,   // Július
  8: 1.15,   // Augusztus
  9: 1.10,   // Szeptember
  10: 1.00,  // Október
  11: 1.20,  // November
  12: 1.25   // December
};
