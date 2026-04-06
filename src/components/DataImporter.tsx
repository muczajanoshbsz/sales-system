import React, { useState } from 'react';
import { useFirebase } from './FirebaseProvider';
import { Button } from './ui/Base';
import { Card } from './ui/Base';
import { cn } from '../lib/utils';
import { Database } from 'lucide-react';
import { apiService } from '../services/apiService';

const DataImporter: React.FC = () => {
  const { user, isAdmin } = useFirebase();
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  const rawData = `(1,'2025-09-14','AirPods Pro 2','bontatlan','Vatera',1,5936.0,24990.0,0.0,19054.0,'Predein Vjacheslav','CLFOX175774541718511','Lezárult','2025-09-14 00:00:00','2025-09-14 00:00:00');`;

  const parseAndImport = async () => {
    if (!isAdmin || !user) return;
    setImporting(true);
    setMessage('Importálás folyamatban...');

    try {
      const lines = rawData.trim().split('\n');
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

      setMessage(`Sikeresen importálva: ${count} eladás.`);
    } catch (error) {
      console.error('Import error:', error);
      setMessage('Hiba történt az importálás során.');
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card className="p-6 bg-slate-50 border-dashed border-2 border-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-200 rounded-lg">
            <Database className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Adat Importálás</h3>
            <p className="text-xs text-slate-500">Korábbi SQL adatok betöltése a rendszerbe.</p>
          </div>
        </div>
        <Button 
          onClick={parseAndImport} 
          isLoading={importing}
          variant="secondary"
          size="sm"
        >
          Importálás Indítása
        </Button>
      </div>
      {message && (
        <p className={cn(
          "mt-3 text-sm font-medium",
          message.includes('Sikeres') ? "text-emerald-600" : "text-red-600"
        )}>
          {message}
        </p>
      )}
    </Card>
  );
};

export default DataImporter;
