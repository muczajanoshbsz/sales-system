import React, { useState } from 'react';
import { useFirebase } from './FirebaseProvider';
import { Button, Card } from './ui/Base';
import { cn } from '../lib/utils';
import { Database, Upload, AlertCircle, CheckCircle2, Loader2, FileCode } from 'lucide-react';
import { apiService } from '../services/apiService';
import { motion, AnimatePresence } from 'motion/react';

const DataImporter: React.FC = () => {
  const { user, isAdmin } = useFirebase();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [sqlData, setSqlData] = useState('');

  const parseAndImport = async () => {
    if (!isAdmin || !user || !sqlData.trim()) return;
    setImporting(true);
    setMessage(null);

    try {
      const lines = sqlData.trim().split('\n');
      let count = 0;

      for (const line of lines) {
        const match = line.match(/\(([^)]+)\)/);
        if (!match) continue;

        const parts = match[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(p => p.trim().replace(/^'|'$/g, ''));
        
        if (parts.length < 13) continue;

        const saleData = {
          date: parts[1],
          model: parts[2],
          condition: parts[3],
          platform: parts[4],
          quantity: Number(parts[5]),
          buy_price: Number(parts[6]),
          sell_price: Number(parts[7]),
          fees: Number(parts[8]),
          profit: Number(parts[9]),
          buyer: parts[10],
          tracking_number: parts[11],
          notes: parts[12],
          userId: user.uid,
        };

        await apiService.addSale(saleData);
        count++;
      }

      setMessage({ type: 'success', text: `Sikeresen importálva: ${count} eladás.` });
      setSqlData('');
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: 'Hiba történt az importálás során. Ellenőrizze az SQL formátumot.' });
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card className="p-6 border-slate-200 bg-slate-50/30 overflow-hidden relative">
      <div className="flex flex-col gap-6 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-xl shadow-lg shadow-slate-200">
              <FileCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 tracking-tight">SQL Adat Importálás</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Korábbi adatbázis sorok betöltése</p>
            </div>
          </div>
          <Button 
            onClick={parseAndImport} 
            isLoading={importing}
            disabled={!sqlData.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-xs font-bold"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importálás Indítása
          </Button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Database className="w-3 h-3" />
            SQL VALUES Tartalom
          </label>
          <textarea 
            value={sqlData}
            onChange={(e) => setSqlData(e.target.value)}
            placeholder="(1,'2025-09-14','AirPods Pro 2','bontatlan','Vatera',1,5936.0,24990.0,0.0,19054.0,'Buyer Name','TRACKING123','Notes');"
            className="w-full h-32 p-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none transition-all resize-none"
          />
          <p className="text-[10px] text-slate-400 italic">
            Másolja be az SQL INSERT INTO ... VALUES utáni részt. Soronként egy rekordot dolgozunk fel.
          </p>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "p-4 rounded-xl flex items-center gap-3 border shadow-sm",
                message.type === 'success' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
              )}
            >
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-bold">{message.text}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Database className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-100 -rotate-12" />
    </Card>
  );
};

export default DataImporter;
