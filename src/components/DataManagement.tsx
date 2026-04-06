import React from 'react';
import DataImporter from './DataImporter';
import DataExporter from './DataExporter';
import { Database, Download, Upload } from 'lucide-react';

const DataManagement: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Database className="w-6 h-6 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Adatkezelés</h2>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Download className="w-5 h-5" />
          <h3 className="text-lg font-bold">Exportálás</h3>
        </div>
        <DataExporter />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Upload className="w-5 h-5" />
          <h3 className="text-lg font-bold">Importálás</h3>
        </div>
        <DataImporter />
      </section>
    </div>
  );
};

export default DataManagement;
