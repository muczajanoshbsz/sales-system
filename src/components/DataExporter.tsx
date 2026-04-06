import React, { useState } from 'react';
import { Button, Card } from './ui/Base';
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, FileText, Database, Table } from 'lucide-react';
import { apiService } from '../services/apiService';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

const DataExporter: React.FC = () => {
  const [exporting, setExporting] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => 
      headers.map(header => {
        const val = obj[header];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  };

  const handleExport = async (type: 'sales' | 'inventory' | 'pending', format: 'csv' | 'json') => {
    const exportId = `${type}-${format}`;
    setExporting(exportId);
    setStatus(null);

    try {
      let data: any[] = [];
      if (type === 'sales') data = await apiService.getSales();
      else if (type === 'inventory') data = await apiService.getStock();
      else if (type === 'pending') data = await apiService.getPendingSales();

      if (data.length === 0) {
        setStatus({ type: 'error', message: 'Nincs exportálható adat.' });
        return;
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `${type}_export_${timestamp}.${format}`;

      if (format === 'json') {
        downloadFile(JSON.stringify(data, null, 2), fileName, 'application/json');
      } else {
        downloadFile(convertToCSV(data), fileName, 'text/csv');
      }

      setStatus({ type: 'success', message: `Sikeres exportálás: ${fileName}` });
      setTimeout(() => setStatus(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setStatus({ type: 'error', message: 'Hiba történt az exportálás során.' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ExportCard 
          title="Eladások" 
          description="Összes rögzített eladás."
          icon={<Table className="w-5 h-5 text-indigo-600" />}
          onExport={(format) => handleExport('sales', format)}
          isExportingCSV={exporting === 'sales-csv'}
          isExportingJSON={exporting === 'sales-json'}
        />
        <ExportCard 
          title="Készlet" 
          description="Aktuális raktárkészlet."
          icon={<Database className="w-5 h-5 text-emerald-600" />}
          onExport={(format) => handleExport('inventory', format)}
          isExportingCSV={exporting === 'inventory-csv'}
          isExportingJSON={exporting === 'inventory-json'}
        />
        <ExportCard 
          title="Függő" 
          description="Le nem zárt tranzakciók."
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          onExport={(format) => handleExport('pending', format)}
          isExportingCSV={exporting === 'pending-csv'}
          isExportingJSON={exporting === 'pending-json'}
        />
      </div>

      {status && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl flex items-center gap-3 border shadow-sm",
            status.type === 'success' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
          )}
        >
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm font-bold">{status.message}</p>
        </motion.div>
      )}
    </div>
  );
};

const ExportCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onExport: (format: 'csv' | 'json') => void;
  isExportingCSV: boolean;
  isExportingJSON: boolean;
}> = ({ title, description, icon, onExport, isExportingCSV, isExportingJSON }) => (
  <Card className="p-5 hover:shadow-xl hover:shadow-slate-100 transition-all border-slate-100 group">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="font-black text-slate-900 text-sm tracking-tight">{title}</h3>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{description}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('csv')}
        disabled={isExportingCSV || isExportingJSON}
        className="bg-white border-slate-200 text-xs font-bold"
      >
        {isExportingCSV ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3 mr-2" />}
        CSV
      </Button>
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('json')}
        disabled={isExportingCSV || isExportingJSON}
        className="bg-white border-slate-200 text-xs font-bold"
      >
        {isExportingJSON ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3 mr-2" />}
        JSON
      </Button>
    </div>
  </Card>
);

export default DataExporter;
