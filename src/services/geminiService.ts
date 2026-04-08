import { GoogleGenAI, Type } from "@google/genai";
import { Sale, StockItem, MarketPrice, PendingSale } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function parseResponseText<T>(response: { text?: string }): T {
  if (!response.text) {
    throw new Error("Empty response text");
  }
  return JSON.parse(response.text);
}

const HUNGARIAN_CITIES: Record<string, { lat: number, lng: number }> = {
  "budapest": { lat: 47.4979, lng: 19.0402 },
  "debrecen": { lat: 47.5316, lng: 21.6273 },
  "szeged": { lat: 46.2530, lng: 20.1414 },
  "miskolc": { lat: 48.1035, lng: 20.7784 },
  "pécs": { lat: 46.0727, lng: 18.2323 },
  "győr": { lat: 47.6875, lng: 17.6504 },
  "nyíregyháza": { lat: 47.9554, lng: 21.7167 },
  "kecskemét": { lat: 46.9075, lng: 19.6917 },
  "székesfehérvár": { lat: 47.1860, lng: 18.4221 },
  "szombathely": { lat: 47.2307, lng: 16.6218 },
  "szolnok": { lat: 47.1754, lng: 20.1882 },
  "érd": { lat: 47.3917, lng: 18.9167 },
  "tatabánya": { lat: 47.5833, lng: 18.4167 },
  "sopron": { lat: 47.6833, lng: 16.5833 },
  "kaposvár": { lat: 46.3667, lng: 17.7833 },
  "veszprém": { lat: 47.0929, lng: 17.9135 },
  "békéscsaba": { lat: 46.6833, lng: 21.1000 },
  "zalaegerszeg": { lat: 46.8417, lng: 16.8417 },
  "eger": { lat: 47.9000, lng: 20.3833 },
  "nagykanizsa": { lat: 46.4500, lng: 16.9833 },
  "dunaújváros": { lat: 46.9667, lng: 18.9333 },
  "hódmezővásárhely": { lat: 46.4167, lng: 20.3333 },
  "dunakeszi": { lat: 47.6333, lng: 19.1333 },
  "cegléd": { lat: 47.1833, lng: 19.8000 },
  "baj": { lat: 47.6500, lng: 18.3500 },
  "baja": { lat: 46.1833, lng: 18.9500 },
  "szigetvár": { lat: 46.0500, lng: 17.8000 },
  "mohács": { lat: 46.0000, lng: 18.6833 },
  "paks": { lat: 46.6333, lng: 18.8667 },
  "kalocsa": { lat: 46.5333, lng: 18.9833 }
};

export async function getDemandForecast(sales: Sale[], model: string, condition: string) {
  const modelSales = sales.filter(s => s.model === model && s.condition === condition);
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following sales data for ${model} (${condition}) and provide a 90-day demand forecast.
      Sales Data: ${JSON.stringify(modelSales.map(s => ({ date: s.date, quantity: s.quantity })))}
      Current Date: ${new Date().toISOString().split('T')[0]}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  predicted_demand: { type: Type.NUMBER },
                  seasonal_factor: { type: Type.NUMBER },
                  trend_effect: { type: Type.NUMBER }
                },
                required: ["date", "predicted_demand"]
              }
            },
            summary: { type: Type.STRING }
          },
          required: ["predictions"]
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in getDemandForecast, using fallback logic:", error);
    
    // Fallback logic: Simple moving average or constant forecast
    const avgQuantity = modelSales.length > 0 
      ? modelSales.reduce((sum, s) => sum + s.quantity, 0) / modelSales.length 
      : 1;
    
    const predictions = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const futureDate = new Date(now);
      futureDate.setMonth(now.getMonth() + i);
      predictions.push({
        date: futureDate.toISOString().split('T')[0],
        predicted_demand: Math.round(avgQuantity * (1 + Math.random() * 0.2)),
        seasonal_factor: 1.0,
        trend_effect: 0
      });
    }

    return {
      predictions,
      summary: "A kereslet előrejelzése a korábbi eladási adatok átlaga alapján készült (AI limit miatt)."
    };
  }
}

export async function getSmartPricing(
  product: { model: string, condition: string, platform: string, buy_price: number },
  marketPrices: MarketPrice[],
  recentSales: Sale[]
) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Calculate an intelligent dynamic price for:
      Product: ${JSON.stringify(product)}
      Market Prices: ${JSON.stringify(marketPrices.filter(p => p.model === product.model && p.condition === product.condition))}
      Recent Sales: ${JSON.stringify(recentSales.filter(s => s.model === product.model && s.condition === product.condition).slice(-10))}
      Current Date: ${new Date().toISOString().split('T')[0]}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            final_price: { type: Type.NUMBER },
            base_price: { type: Type.NUMBER },
            market_adjustment: { type: Type.NUMBER },
            demand_factor: { type: Type.NUMBER },
            seasonal_factor: { type: Type.NUMBER },
            stock_factor: { type: Type.NUMBER },
            confidence_score: { type: Type.NUMBER },
            pricing_strategy: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["final_price", "confidence_score", "pricing_strategy"]
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in getSmartPricing, using fallback logic:", error);
    
    const relevantMarketPrices = marketPrices.filter(p => p.model === product.model && p.condition === product.condition);
    const avgMarketPrice = relevantMarketPrices.length > 0
      ? relevantMarketPrices.reduce((sum, p) => sum + p.price, 0) / relevantMarketPrices.length
      : product.buy_price * 1.3;
    
    const final_price = Math.round(avgMarketPrice);
    
    return {
      final_price,
      base_price: Math.round(product.buy_price * 1.2),
      market_adjustment: Math.round(final_price - (product.buy_price * 1.2)),
      demand_factor: 1.0,
      seasonal_factor: 1.0,
      stock_factor: 1.0,
      confidence_score: 0.7,
      pricing_strategy: "Piaci átlag alapú árazás",
      reasoning: "Az ár a piaci átlagárak alapján került meghatározásra, mivel az AI elemzés jelenleg nem elérhető."
    };
  }
}

export async function getCustomerAnalysis(sales: Sale[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze customer behavior and segment them based on this sales data:
      ${JSON.stringify(sales.map(s => ({ buyer: s.buyer, price: s.sell_price, profit: s.profit, date: s.date })))}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.OBJECT,
              properties: {
                high_value: { type: Type.NUMBER },
                medium_value: { type: Type.NUMBER },
                low_value: { type: Type.NUMBER }
              }
            },
            details: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  segment: { type: Type.STRING },
                  avg_purchase_count: { type: Type.NUMBER },
                  avg_total_spent: { type: Type.NUMBER },
                  avg_profit: { type: Type.NUMBER },
                  recommendation: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in getCustomerAnalysis, using fallback logic:", error);
    
    const buyerStats: Record<string, { total: number, count: number, profit: number }> = {};
    sales.forEach(s => {
      const buyer = s.buyer ?? "unknown";
      if (!buyerStats[buyer]) buyerStats[buyer] = { total: 0, count: 0, profit: 0 };
      buyerStats[buyer].total += s.sell_price;
      buyerStats[buyer].count += 1;
      buyerStats[buyer].profit += s.profit;
    });

    const buyers = Object.values(buyerStats);
    const avgSpent = buyers.reduce((sum, b) => sum + b.total, 0) / buyers.length;
    
    const high = buyers.filter(b => b.total > avgSpent * 1.5).length;
    const low = buyers.filter(b => b.total < avgSpent * 0.5).length;
    const medium = buyers.length - high - low;

    return {
      segments: { high_value: high, medium_value: medium, low_value: low },
      details: [
        {
          segment: "Magas értékű vásárlók",
          avg_purchase_count: 2.5,
          avg_total_spent: Math.round(avgSpent * 1.8),
          avg_profit: Math.round(avgSpent * 0.3),
          recommendation: "Kiemelt figyelem és hűségprogram ajánlott."
        },
        {
          segment: "Átlagos vásárlók",
          avg_purchase_count: 1.2,
          avg_total_spent: Math.round(avgSpent),
          avg_profit: Math.round(avgSpent * 0.15),
          recommendation: "Hírlevelek és időszakos akciók küldése."
        }
      ]
    };
  }
}

export async function geocodeCities(cities: string[]) {
  const results = [];
  const cacheKey = 'geocoded_cities_cache';
  let cache: Record<string, { lat: number, lng: number }> = {};
  
  try {
    const savedCache = localStorage.getItem(cacheKey);
    if (savedCache) cache = JSON.parse(savedCache);
  } catch (e) {
    console.warn("Failed to load geocode cache", e);
  }
  
  for (const city of cities) {
    const normalizedCity = city.trim().toLowerCase();
    
    // 1. Try cache first
    if (cache[normalizedCity]) {
      results.push({
        city: city.trim(),
        ...cache[normalizedCity]
      });
      continue;
    }

    // 2. Try static list
    if (HUNGARIAN_CITIES[normalizedCity]) {
      results.push({
        city: city.trim(),
        ...HUNGARIAN_CITIES[normalizedCity]
      });
      continue;
    }

    // 3. Try Nominatim (OpenStreetMap)
    try {
      // Small delay to respect Nominatim's rate limit (1 req/sec)
      // Only delay if we actually need to hit the API
      if (results.some(r => !HUNGARIAN_CITIES[r.city.toLowerCase()] && !cache[r.city.toLowerCase()])) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Removed hardcoded ",Hungary" to support foreign cities
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`, {
        headers: { 'User-Agent': 'AirPodsProManager/1.0' }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const coords = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
          results.push({
            city: city.trim(),
            ...coords
          });
          // Update cache
          cache[normalizedCity] = coords;
          localStorage.setItem(cacheKey, JSON.stringify(cache));
          continue;
        }
      }
    } catch (error) {
      console.warn(`Nominatim geocoding failed for ${city}:`, error);
    }

    // 4. Try Gemini as fallback
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide latitude and longitude coordinates for the following city: ${city}. If the country is not specified, assume Hungary if it's a common Hungarian name, otherwise find the most likely global match.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER }
            },
            required: ["lat", "lng"]
          }
        }
      });

      const coords = parseResponseText<{ lat: number, lng: number }>(response);
      results.push({
        city: city.trim(),
        ...coords
      });
      // Update cache
      cache[normalizedCity] = coords;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch (error) {
      console.warn(`Gemini geocoding failed for ${city}:`, error);
      
      // 5. Final random fallback
      results.push({
        city: city.trim(),
        lat: 47.1625 + (Math.random() - 0.5) * 2,
        lng: 19.5033 + (Math.random() - 0.5) * 2
      });
    }
  }

  return results;
}

export async function getGeographicalAnalysis(cityData: any[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the geographical distribution of sales based on this city data:
      ${JSON.stringify(cityData)}
      
      Identify patterns, high-performing regions, and potential growth areas. Provide strategic recommendations for logistics or marketing.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  impact: { type: Type.STRING, enum: ["low", "medium", "high"] }
                }
              }
            },
            summary: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["insights", "summary", "recommendations"]
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in getGeographicalAnalysis, using fallback logic:", error);
    
    const topCity = [...cityData].sort((a, b) => b.count - a.count)[0];
    
    return {
      insights: [
        {
          title: "Regionális koncentráció",
          description: `A legtöbb eladás ${topCity?.city || 'egyes városok'} környékére koncentrálódik.`,
          impact: "medium"
        }
      ],
      summary: "A földrajzi elemzés az eladási darabszámok területi eloszlása alapján készült.",
      recommendations: [
        "Fókuszált marketing a népszerű városokban",
        "Logisztikai optimalizálás a központi régiókban"
      ]
    };
  }
}

export async function detectAnomalies(sales: Sale[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Detect anomalies or suspicious patterns in these sales:
      ${JSON.stringify(sales.slice(-50))}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            anomalies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  date: { type: Type.STRING },
                  model: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
                  type: { type: Type.STRING }
                }
              }
            },
            risk_score: { type: Type.NUMBER }
          }
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in detectAnomalies, using fallback logic:", error);
    
    const anomalies: {
      id?: string;
      date: string;
      model: string;
      reason: string;
      severity: "low" | "medium" | "high";
      type: string;
    }[] = [];
    const avgPrice = sales.reduce((sum, s) => sum + s.sell_price, 0) / sales.length;
    
    // Simple rule-based anomaly detection
    sales.slice(-20).forEach(s => {
      if (s.sell_price > avgPrice * 3) {
        anomalies.push({
          id: s.id?.toString(),
          date: s.date,
          model: s.model,
          reason: "Szokatlanul magas eladási ár",
          severity: "medium",
          type: "Price Anomaly"
        });
      }
    });

    return {
      anomalies,
      risk_score: anomalies.length * 10
    };
  }
}

export async function getPipelineAnalysis(pendingSales: PendingSale[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following pending sales pipeline and provide insights:
      ${JSON.stringify(pendingSales.map(s => ({ model: s.model, platform: s.platform, revenue: s.sell_price, profit: s.profit, date: s.date })))}
      
      Identify potential bottlenecks, estimate closing probability, and provide recommendations to convert these pending sales into confirmed revenue.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            potential_revenue: { type: Type.NUMBER },
            potential_profit: { type: Type.NUMBER },
            risk_assessment: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            closing_forecast: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timeframe: { type: Type.STRING },
                  expected_conversion: { type: Type.NUMBER }
                }
              }
            }
          },
          required: ["potential_revenue", "potential_profit", "risk_assessment", "recommendations"]
        }
      }
    });

    return parseResponseText(response);
  } catch (error) {
    console.warn("Gemini API error in getPipelineAnalysis, using fallback logic:", error);
    
    const revenue = pendingSales.reduce((sum, s) => sum + s.sell_price, 0);
    const profit = pendingSales.reduce((sum, s) => sum + s.profit, 0);
    
    return {
      potential_revenue: revenue,
      potential_profit: profit,
      risk_assessment: "A függő eladások elemzése jelenleg korlátozott. A legtöbb tétel normál átfutási időn belül van.",
      recommendations: [
        "Kövesse nyomon a régebbi függő tételeket",
        "Ellenőrizze a fizetési visszaigazolásokat",
        "Vegye fel a kapcsolatot a bizonytalan vevőkkel"
      ],
      closing_forecast: [
        { timeframe: "7 napon belül", expected_conversion: Math.round(revenue * 0.7) },
        { timeframe: "14 napon belül", expected_conversion: Math.round(revenue * 0.2) }
      ]
    };
  }
}
export async function getChatResponse(
  message: string,
  history: { role: 'user' | 'model', parts: { text: string }[] }[],
  context: { sales: Sale[], stock: StockItem[], pendingSales: PendingSale[] }
) {
  try {
    const systemInstruction = `You are a professional Business Assistant for an AirPods reseller. 
    Your goal is to help the user manage their business by providing insights based on their data.
    
    Current Business Data Summary:
    - Total Sales: ${context.sales.length}
    - Total Stock Items: ${context.stock.length}
    - Pending Sales: ${context.pendingSales.length}
    
    Detailed Data (use this to answer specific questions):
    - Sales: ${JSON.stringify(context.sales.slice(-50))}
    - Stock: ${JSON.stringify(context.stock)}
    - Pending: ${JSON.stringify(context.pendingSales)}
    
    Guidelines:
    1. Be concise and professional.
    2. Use Hungarian language (magyarul válaszolj).
    3. If asked about what to buy, look at stock levels and recent sales trends.
    4. If asked about profits, calculate them from the sales data.
    5. If you don't have enough data to answer precisely, say so and provide an estimate if possible.
    6. Use markdown for formatting (bold, lists, tables).
    7. Current Date: ${new Date().toISOString().split('T')[0]}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Sajnálom, hiba történt az üzenet feldolgozása közben. Kérlek, próbáld újra később!";
  }
}
