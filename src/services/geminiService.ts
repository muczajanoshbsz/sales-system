import { Sale, StockItem, MarketPrice, PendingSale } from "../types";

type ChatHistoryItem = {
  role: "user" | "model";
  parts: { text: string }[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

const HUNGARIAN_CITIES: Record<string, { lat: number; lng: number }> = {
  budapest: { lat: 47.4979, lng: 19.0402 },
  debrecen: { lat: 47.5316, lng: 21.6273 },
  szeged: { lat: 46.253, lng: 20.1414 },
  miskolc: { lat: 48.1035, lng: 20.7784 },
  "pécs": { lat: 46.0727, lng: 18.2323 },
  "győr": { lat: 47.6875, lng: 17.6504 },
  "nyíregyháza": { lat: 47.9554, lng: 21.7167 },
  "kecskemét": { lat: 46.9075, lng: 19.6917 },
  "székesfehérvár": { lat: 47.186, lng: 18.4221 },
  szombathely: { lat: 47.2307, lng: 16.6218 },
  szolnok: { lat: 47.1754, lng: 20.1882 },
  "érd": { lat: 47.3917, lng: 18.9167 },
  "tatabánya": { lat: 47.5833, lng: 18.4167 },
  sopron: { lat: 47.6833, lng: 16.5833 },
  "kaposvár": { lat: 46.3667, lng: 17.7833 },
  "veszprém": { lat: 47.0929, lng: 17.9135 },
  "békéscsaba": { lat: 46.6833, lng: 21.1 },
  zalaegerszeg: { lat: 46.8417, lng: 16.8417 },
  eger: { lat: 47.9, lng: 20.3833 },
  nagykanizsa: { lat: 46.45, lng: 16.9833 },
  "dunaújváros": { lat: 46.9667, lng: 18.9333 },
  "hódmezővásárhely": { lat: 46.4167, lng: 20.3333 },
  dunakeszi: { lat: 47.6333, lng: 19.1333 },
  "cegléd": { lat: 47.1833, lng: 19.8 },
  baj: { lat: 47.65, lng: 18.35 },
  baja: { lat: 46.1833, lng: 18.95 },
  szigetvár: { lat: 46.05, lng: 17.8 },
  mohács: { lat: 46.0, lng: 18.6833 },
  paks: { lat: 46.6333, lng: 18.8667 },
  kalocsa: { lat: 46.5333, lng: 18.9833 },
};

export async function getDemandForecast(sales: Sale[], model: string, condition: string) {
  try {
    return await postJson<{
      predictions: {
        date: string;
        predicted_demand: number;
        seasonal_factor: number;
        trend_effect: number;
      }[];
      summary: string;
    }>("/api/ai/demand-forecast", { sales, model, condition });
  } catch (error) {
    console.warn("AI demand forecast failed, using fallback:", error);

    const modelSales = sales.filter((s) => s.model === model && s.condition === condition);
    const avgQuantity =
      modelSales.length > 0
        ? modelSales.reduce((sum, s) => sum + s.quantity, 0) / modelSales.length
        : 1;

    const predictions = [];
    const now = new Date();

    for (let i = 1; i <= 3; i++) {
      const futureDate = new Date(now);
      futureDate.setMonth(now.getMonth() + i);
      predictions.push({
        date: futureDate.toISOString().split("T")[0],
        predicted_demand: Math.round(avgQuantity),
        seasonal_factor: 1,
        trend_effect: 0,
      });
    }

    return {
      predictions,
      summary: "A kereslet előrejelzése a korábbi eladási adatok átlaga alapján készült.",
    };
  }
}

export async function getSmartPricing(
  product: { model: string; condition: string; platform: string; buy_price: number },
  marketPrices: MarketPrice[],
  recentSales: Sale[]
) {
  try {
    return await postJson<{
      final_price: number;
      base_price: number;
      market_adjustment: number;
      demand_factor: number;
      seasonal_factor: number;
      stock_factor: number;
      confidence_score: number;
      pricing_strategy: string;
      reasoning: string;
    }>("/api/ai/smart-pricing", { product, marketPrices, recentSales });
  } catch (error) {
    console.warn("AI pricing failed, using fallback:", error);

    const relevantMarketPrices = marketPrices.filter(
      (p) => p.model === product.model && p.condition === product.condition
    );
    const avgMarketPrice =
      relevantMarketPrices.length > 0
        ? relevantMarketPrices.reduce((sum, p) => sum + p.price, 0) / relevantMarketPrices.length
        : product.buy_price * 1.3;

    const final_price = Math.round(avgMarketPrice);

    return {
      final_price,
      base_price: Math.round(product.buy_price * 1.2),
      market_adjustment: Math.round(final_price - product.buy_price * 1.2),
      demand_factor: 1,
      seasonal_factor: 1,
      stock_factor: 1,
      confidence_score: 0.7,
      pricing_strategy: "Piaci átlag alapú árazás",
      reasoning: "Az ár a piaci átlagárak alapján került meghatározásra, mert az AI válasz nem volt elérhető.",
    };
  }
}

export async function getCustomerAnalysis(sales: Sale[]) {
  try {
    return await postJson<{
      segments: {
        high_value: number;
        medium_value: number;
        low_value: number;
      };
      details: {
        segment: string;
        avg_purchase_count: number;
        avg_total_spent: number;
        avg_profit: number;
        recommendation: string;
      }[];
    }>("/api/ai/customer-analysis", { sales });
  } catch (error) {
    console.warn("AI customer analysis failed, using fallback:", error);

    const buyerStats: Record<string, { total: number; count: number; profit: number }> = {};
    sales.forEach((s) => {
      const buyer = s.buyer ?? "unknown";
      if (!buyerStats[buyer]) buyerStats[buyer] = { total: 0, count: 0, profit: 0 };
      buyerStats[buyer].total += s.sell_price;
      buyerStats[buyer].count += 1;
      buyerStats[buyer].profit += s.profit;
    });

    const buyers = Object.values(buyerStats);
    const avgSpent = buyers.length
      ? buyers.reduce((sum, b) => sum + b.total, 0) / buyers.length
      : 0;

    const high = buyers.filter((b) => b.total > avgSpent * 1.5).length;
    const low = buyers.filter((b) => b.total < avgSpent * 0.5).length;
    const medium = Math.max(0, buyers.length - high - low);

    return {
      segments: { high_value: high, medium_value: medium, low_value: low },
      details: [
        {
          segment: "Magas értékű vásárlók",
          avg_purchase_count: 2.5,
          avg_total_spent: Math.round(avgSpent * 1.8 || 0),
          avg_profit: Math.round(avgSpent * 0.3 || 0),
          recommendation: "Kiemelt figyelem és hűségprogram ajánlott.",
        },
        {
          segment: "Átlagos vásárlók",
          avg_purchase_count: 1.2,
          avg_total_spent: Math.round(avgSpent || 0),
          avg_profit: Math.round(avgSpent * 0.15 || 0),
          recommendation: "Hírlevelek és időszakos akciók küldése.",
        },
      ],
    };
  }
}

export async function geocodeCities(cities: string[]) {
  const results: { city: string; lat: number; lng: number }[] = [];
  const cacheKey = "geocoded_cities_cache";
  let cache: Record<string, { lat: number; lng: number }> = {};

  try {
    const savedCache = localStorage.getItem(cacheKey);
    if (savedCache) cache = JSON.parse(savedCache);
  } catch (e) {
    console.warn("Failed to load geocode cache", e);
  }

  for (const city of cities) {
    const normalizedCity = city.trim().toLowerCase();

    if (cache[normalizedCity]) {
      results.push({ city: city.trim(), ...cache[normalizedCity] });
      continue;
    }

    if (HUNGARIAN_CITIES[normalizedCity]) {
      results.push({ city: city.trim(), ...HUNGARIAN_CITIES[normalizedCity] });
      continue;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`,
        {
          headers: { "User-Agent": "AirPodsProManager/1.0" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data?.length > 0) {
          const coords = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };
          results.push({ city: city.trim(), ...coords });
          cache[normalizedCity] = coords;
          localStorage.setItem(cacheKey, JSON.stringify(cache));
          continue;
        }
      }
    } catch (error) {
      console.warn(`Nominatim geocoding failed for ${city}:`, error);
    }

    results.push({
      city: city.trim(),
      lat: 47.1625 + (Math.random() - 0.5) * 2,
      lng: 19.5033 + (Math.random() - 0.5) * 2,
    });
  }

  return results;
}

export async function getGeographicalAnalysis(cityData: any[]) {
  try {
    return await postJson<{
      insights: {
        title: string;
        description: string;
        impact: "low" | "medium" | "high";
      }[];
      summary: string;
      recommendations: string[];
    }>("/api/ai/geographical-analysis", { cityData });
  } catch (error) {
    console.warn("AI geographical analysis failed, using fallback:", error);

    const topCity = [...cityData].sort((a, b) => b.count - a.count)[0];

    return {
      insights: [
        {
          title: "Regionális koncentráció",
          description: `A legtöbb eladás ${topCity?.city || "egyes városok"} környékére koncentrálódik.`,
          impact: "medium" as const,
        },
      ],
      summary: "A földrajzi elemzés az eladási darabszámok területi eloszlása alapján készült.",
      recommendations: [
        "Fókuszált marketing a népszerű városokban",
        "Logisztikai optimalizálás a központi régiókban",
      ],
    };
  }
}

export async function detectAnomalies(sales: Sale[]) {
  try {
    return await postJson<{
      anomalies: {
        id?: string;
        date: string;
        model: string;
        reason: string;
        severity: "low" | "medium" | "high";
        type: string;
      }[];
      risk_score: number;
    }>("/api/ai/detect-anomalies", { sales });
  } catch (error) {
    console.warn("AI anomaly detection failed, using fallback:", error);

    const anomalies: {
      id?: string;
      date: string;
      model: string;
      reason: string;
      severity: "low" | "medium" | "high";
      type: string;
    }[] = [];

    const avgPrice = sales.length
      ? sales.reduce((sum, s) => sum + s.sell_price, 0) / sales.length
      : 0;

    sales.slice(-20).forEach((s) => {
      if (avgPrice > 0 && s.sell_price > avgPrice * 3) {
        anomalies.push({
          id: s.id?.toString(),
          date: s.date,
          model: s.model,
          reason: "Szokatlanul magas eladási ár",
          severity: "medium",
          type: "Price Anomaly",
        });
      }
    });

    return {
      anomalies,
      risk_score: anomalies.length * 10,
    };
  }
}

export async function getPipelineAnalysis(pendingSales: PendingSale[]) {
  try {
    return await postJson<{
      potential_revenue: number;
      potential_profit: number;
      risk_assessment: string;
      recommendations: string[];
      closing_forecast: {
        timeframe: string;
        expected_conversion: number;
      }[];
    }>("/api/ai/pipeline-analysis", { pendingSales });
  } catch (error) {
    console.warn("AI pipeline analysis failed, using fallback:", error);

    const revenue = pendingSales.reduce((sum, s) => sum + s.sell_price, 0);
    const profit = pendingSales.reduce((sum, s) => sum + s.profit, 0);

    return {
      potential_revenue: revenue,
      potential_profit: profit,
      risk_assessment:
        "A függő eladások elemzése jelenleg korlátozott. A legtöbb tétel normál átfutási időn belül van.",
      recommendations: [
        "Kövesse nyomon a régebbi függő tételeket",
        "Ellenőrizze a fizetési visszaigazolásokat",
        "Vegye fel a kapcsolatot a bizonytalan vevőkkel",
      ],
      closing_forecast: [
        { timeframe: "7 napon belül", expected_conversion: Math.round(revenue * 0.7) },
        { timeframe: "14 napon belül", expected_conversion: Math.round(revenue * 0.2) },
      ],
    };
  }
}

export async function getChatResponse(
  message: string,
  history: ChatHistoryItem[],
  context: { sales: Sale[]; stock: StockItem[]; pendingSales: PendingSale[] }
) {
  try {
    const data = await postJson<{ text: string }>("/api/ai/chat", {
      message,
      history,
      context,
    });

    return data.text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Sajnálom, hiba történt az üzenet feldolgozása közben. Kérlek, próbáld újra később!";
  }
}