import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sale, StockItem, MarketPrice, PendingSale } from '../types';
import { getDemandForecast, getSmartPricing, getCustomerAnalysis, detectAnomalies, getGeographicalAnalysis, geocodeCities, getPipelineAnalysis } from '../services/geminiService';
import { Button, Card, Input, Select } from './ui/Base';
import { formatCurrency, cn } from '../lib/utils';
import { APP_CONFIG } from '../constants';
import { Brain, TrendingUp, Users, AlertTriangle, Sparkles, Loader2, MapPin, Clock, BarChart3, DollarSign } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { apiService } from '../services/apiService';

const AIDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'forecast' | 'pricing' | 'customers' | 'anomalies' | 'geographical' | 'pipeline'>('forecast');
  const [sales, setSales] = useState<Sale[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  // Results
  const [forecast, setForecast] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [customers, setCustomers] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [geoAnalysis, setGeoAnalysis] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any>(null);

  // Form state for pricing
  const [pricingForm, setPricingForm] = useState({
    model: '',
    condition: APP_CONFIG.conditions[0],
    platform: APP_CONFIG.platforms[0],
    buy_price: 0,
  });

  const filteredMarketPrices = useMemo(() => {
    return marketPrices
      .filter(mp => mp.model === pricingForm.model && mp.condition === pricingForm.condition)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [marketPrices, pricingForm.model, pricingForm.condition]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [salesData, stockData, marketData, pendingData, modelsData] = await Promise.all([
          apiService.getSales(),
          apiService.getStock(),
          apiService.getMarketPrices(),
          apiService.getPendingSales(),
          apiService.getActiveModels()
        ]);
        
        setSales(salesData);
        setStock(stockData);
        setMarketPrices(marketData);
        setPendingSales(pendingData);
        setModels(modelsData);
        
        if (modelsData.length > 0 && !pricingForm.model) {
          setPricingForm(prev => ({ ...prev, model: modelsData[0] }));
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleForecast = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await getDemandForecast(sales, pricingForm.model, pricingForm.condition);
      setForecast(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [sales, pricingForm.model, pricingForm.condition]);

  const handlePricing = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await getSmartPricing(pricingForm, marketPrices, sales);
      setPricing(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [pricingForm, marketPrices, sales]);

  const handleCustomerAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await getCustomerAnalysis(sales);
      setCustomers(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [sales]);

  const handleAnomalies = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await detectAnomalies(sales);
      setAnomalies(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [sales]);

  const handleGeoAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const cityCounts: Record<string, number> = {};
      sales.forEach(sale => {
        if (sale.city) {
          cityCounts[sale.city] = (cityCounts[sale.city] || 0) + sale.quantity;
        }
      });

      const uniqueCities = Object.keys(cityCounts);
      if (uniqueCities.length === 0) {
        setGeoAnalysis({ summary: "Nincsenek város adatok az eladásokban.", insights: [], recommendations: [] });
        return;
      }

      const geocoded = await geocodeCities(uniqueCities);
      const cityData = geocoded.map((g: any) => ({
        ...g,
        count: cityCounts[g.city] || 0
      }));

      const res = await getGeographicalAnalysis(cityData);
      setGeoAnalysis(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [sales]);

  const handlePipelineAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await getPipelineAnalysis(pendingSales.filter(p => p.status === 'pending'));
      setPipeline(res);
    } catch (error) {
      console.error(error);
    } finally {
      setAiLoading(false);
    }
  }, [pendingSales]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-md">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Elemzés</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intelligens előrejelzések és üzleti betekintések</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-fit overflow-x-auto no-scrollbar">
        <TabButton active={activeTab === 'forecast'} onClick={() => setActiveTab('forecast')} icon={TrendingUp} label="Előrejelzés" />
        <TabButton active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon={Sparkles} label="Árazás" />
        <TabButton active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={Users} label="Vásárlók" />
        <TabButton active={activeTab === 'geographical'} onClick={() => setActiveTab('geographical')} icon={MapPin} label="Földrajzi" />
        <TabButton active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} icon={Clock} label="Pipeline" />
        <TabButton active={activeTab === 'anomalies'} onClick={() => setActiveTab('anomalies')} icon={AlertTriangle} label="Anomáliák" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'forecast' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Modell</label>
                <Select value={pricingForm.model} onChange={(e) => setPricingForm({...pricingForm, model: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Állapot</label>
                <Select value={pricingForm.condition} onChange={(e) => setPricingForm({...pricingForm, condition: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  {APP_CONFIG.conditions.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <Button onClick={handleForecast} isLoading={aiLoading} className="bg-indigo-600 hover:bg-indigo-700">Elemzés Indítása</Button>
            </div>

            {forecast && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecast.predictions}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--tw-color-slate-900)', border: 'none', color: 'white' }} />
                      <Line type="monotone" dataKey="predicted_demand" stroke="#6366f1" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">{forecast.summary}</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'pipeline' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pipeline Elemzés</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">A függő eladások várható bevétele és konverziója</p>
              </div>
              <Button onClick={handlePipelineAnalysis} isLoading={aiLoading} className="bg-indigo-600 hover:bg-indigo-700">Elemzés Futtatása</Button>
            </div>

            {pipeline && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-900 dark:bg-black rounded-2xl text-white">
                    <div className="flex items-center gap-3 mb-4">
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Várható Bevétel</span>
                    </div>
                    <h3 className="text-4xl font-black">{formatCurrency(pipeline.potential_revenue)}</h3>
                    <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">Várható profit: <span className="text-emerald-400 font-bold">{formatCurrency(pipeline.potential_profit)}</span></p>
                  </div>

                  <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-sm font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">Kockázati Értékelés</span>
                    </div>
                    <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed font-medium">{pipeline.risk_assessment}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Konverziós Előrejelzés
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pipeline.closing_forecast}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                          <XAxis dataKey="timeframe" stroke="#94a3b8" fontSize={12} />
                          <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v/1000}k`} />
                          <Tooltip contentStyle={{ backgroundColor: 'var(--tw-color-slate-900)', border: 'none', color: 'white' }} formatter={(v: number) => formatCurrency(v)} />
                          <Bar dataKey="expected_conversion" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      Konverziós Javaslatok
                    </h4>
                    <div className="space-y-3">
                      {pipeline.recommendations.map((rec: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                          <p className="text-sm text-slate-700 dark:text-slate-300">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'pricing' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-slate-300">Modell</label>
                <Select value={pricingForm.model} onChange={(e) => setPricingForm({...pricingForm, model: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-slate-300">Állapot</label>
                <Select value={pricingForm.condition} onChange={(e) => setPricingForm({...pricingForm, condition: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  {APP_CONFIG.conditions.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-slate-300">Platform</label>
                <Select value={pricingForm.platform} onChange={(e) => setPricingForm({...pricingForm, platform: e.target.value})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  {APP_CONFIG.platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-slate-300">Beszerzési Ár</label>
                <Input type="number" value={pricingForm.buy_price} onChange={(e) => setPricingForm({...pricingForm, buy_price: Number(e.target.value)})} className="dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
              </div>
              <Button onClick={handlePricing} isLoading={aiLoading} className="sm:col-span-2 lg:col-span-1">Árajánlat Kérése</Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Piaci Ár Előzmények ({pricingForm.model})
                </h4>
                <div className="h-48 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredMarketPrices}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--tw-color-slate-900)', color: 'white' }}
                        formatter={(value: number) => [formatCurrency(value), 'Ár']}
                      />
                      <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {pricing && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-slate-900 dark:bg-black rounded-2xl p-6 text-white flex flex-col items-center justify-center text-center h-full">
                    <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold mb-2 uppercase tracking-widest">Javasolt Eladási Ár</p>
                    <h3 className="text-4xl font-black mb-4">{formatCurrency(pricing.final_price)}</h3>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      {pricing.pricing_strategy} stratégia
                    </div>
                  </div>
                </div>
              )}
            </div>

            {pricing && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-900 dark:text-white">Árképzés Részletei</h4>
                  <div className="space-y-3">
                    <PricingDetail label="Alapár" value={formatCurrency(pricing.base_price)} />
                    <PricingDetail label="Piaci korrekció" value={`× ${pricing.market_adjustment}`} />
                    <PricingDetail label="Kereslet faktor" value={`× ${pricing.demand_factor}`} />
                    <PricingDetail label="Szezonális hatás" value={`× ${pricing.seasonal_factor}`} />
                    <PricingDetail label="Megbízhatóság" value={`${Math.round(pricing.confidence_score * 100)}%`} />
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl text-sm text-slate-600 dark:text-slate-400 italic relative">
                    <span className="absolute top-2 left-2 text-4xl text-slate-200 dark:text-slate-700 font-serif">"</span>
                    <p className="relative z-10">{pricing.reasoning}</p>
                    <span className="absolute bottom-2 right-2 text-4xl text-slate-200 dark:text-slate-700 font-serif">"</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'customers' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Vásárlói viselkedés elemzése és szegmentálás.</p>
              <Button onClick={handleCustomerAnalysis} isLoading={aiLoading}>Elemzés Futtatása</Button>
            </div>
            {customers && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <CustomerSegmentCard type="high" count={customers.segments.high_value} label="Prémium Vásárlók" />
                <CustomerSegmentCard type="medium" count={customers.segments.medium_value} label="Rendszeres Vásárlók" />
                <CustomerSegmentCard type="low" count={customers.segments.low_value} label="Alkalmi Vásárlók" />
                <div className="md:col-span-3 space-y-4">
                  <h4 className="font-bold text-slate-900 dark:text-white">Részletes Megállapítások</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {customers.details.map((d: any, i: number) => (
                      <div key={i} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <p className="font-bold text-slate-900 dark:text-white capitalize mb-1">{d.segment}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Átl. költés: {formatCurrency(d.avg_total_spent)}</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{d.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'geographical' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Földrajzi eloszlás és logisztikai optimalizálás.</p>
              <Button onClick={handleGeoAnalysis} isLoading={aiLoading}>Elemzés Futtatása</Button>
            </div>
            {geoAnalysis && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">{geoAnalysis.summary}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {geoAnalysis.insights.map((insight: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          insight.impact === 'high' ? "bg-red-500" : insight.impact === 'medium' ? "bg-amber-500" : "bg-blue-500"
                        )} />
                        <h4 className="font-bold text-slate-900 dark:text-white">{insight.title}</h4>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{insight.description}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-white">Stratégiai Javaslatok</h4>
                  <ul className="space-y-2">
                    {geoAnalysis.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'anomalies' && (
          <Card className="p-6 space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Szokatlan minták és lehetséges hibák keresése.</p>
              <Button onClick={handleAnomalies} isLoading={aiLoading}>Vizsgálat Indítása</Button>
            </div>
            {anomalies && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900 dark:bg-black text-white">
                  <div className={cn(
                    "p-3 rounded-lg",
                    anomalies.risk_score > 0.5 ? "bg-red-500" : "bg-emerald-500"
                  )}>
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Kockázati Index</p>
                    <p className="text-2xl font-black">{Math.round(anomalies.risk_score * 100)}%</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {anomalies.anomalies.map((a: any, i: number) => (
                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className={cn(
                        "w-2 h-2 rounded-full mt-2 shrink-0",
                        a.severity === 'high' ? "bg-red-500" : a.severity === 'medium' ? "bg-amber-500" : "bg-blue-500"
                      )} />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{a.reason}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{a.date} • {a.model} • {a.type}</p>
                      </div>
                    </div>
                  ))}
                  {anomalies.anomalies.length === 0 && (
                    <div className="py-12 text-center text-slate-500 italic">Nem találtunk gyanús mintákat.</div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: any; label: string }> = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
      active ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
    )}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const PricingDetail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-sm font-bold text-slate-900 dark:text-white">{value}</span>
  </div>
);

const CustomerSegmentCard: React.FC<{ type: 'high' | 'medium' | 'low'; count: number; label: string }> = ({ type, count, label }) => {
  const colors = {
    high: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800',
    medium: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800',
    low: 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800',
  };
  return (
    <div className={cn("p-6 rounded-2xl border text-center", colors[type])}>
      <p className="text-3xl font-black mb-1">{count}</p>
      <p className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</p>
    </div>
  );
};

export default AIDashboard;
