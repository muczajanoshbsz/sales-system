import React, { useState } from 'react';
import { Button, Card } from './ui/Base';
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/apiService';
import { cn } from '../lib/utils';

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ExportCard 
          title="Eladások" 
          description="Összes rögzített eladás exportálása."
          onExport={(format) => handleExport('sales', format)}
          isExportingCSV={exporting === 'sales-csv'}
          isExportingJSON={exporting === 'sales-json'}
        />
        <ExportCard 
          title="Készlet" 
          description="Aktuális raktárkészlet exportálása."
          onExport={(format) => handleExport('inventory', format)}
          isExportingCSV={exporting === 'inventory-csv'}
          isExportingJSON={exporting === 'inventory-json'}
        />
        <ExportCard 
          title="Függő Eladások" 
          description="Még le nem zárt tranzakciók exportálása."
          onExport={(format) => handleExport('pending', format)}
          isExportingCSV={exporting === 'pending-csv'}
          isExportingJSON={exporting === 'pending-json'}
        />
      </div>

      {status && (
        <div className={cn(
          "p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
          status.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
        )}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}
    </div>
  );
};

const ExportCard: React.FC<{
  title: string;
  description: string;
  onExport: (format: 'csv' | 'json') => void;
  isExportingCSV: boolean;
  isExportingJSON: boolean;
}> = ({ title, description, onExport, isExportingCSV, isExportingJSON }) => (
  <Card className="p-6 hover:shadow-md transition-shadow">
    <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
    <p className="text-xs text-slate-500 mb-6">{description}</p>
    <div className="grid grid-cols-2 gap-3">
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('csv')}
        disabled={isExportingCSV || isExportingJSON}
      >
        {isExportingCSV ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
        CSV
      </Button>
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={() => onExport('json')}
        disabled={isExportingCSV || isExportingJSON}
      >
        {isExportingJSON ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4 mr-2" />}
        JSON
      </Button>
    </div>
  </Card>
);

const AlertCircle: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);

export default DataExporter;
