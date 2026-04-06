import React, { useState, useRef } from 'react';
import { Card, Button } from './ui/Base';
import { ShieldCheck, Download, Upload, Loader2, AlertTriangle, CheckCircle2, FileArchive } from 'lucide-react';
import { apiService } from '../services/apiService';
import { cn } from '../lib/utils';
import { Modal } from './ui/Modal';

const SystemBackup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateBackup = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const backup = await apiService.getSystemBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `airpods_manager_full_backup_${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'Rendszer biztonsági mentés sikeresen létrehozva.' });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Hiba történt a mentés során: ' + (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target?.result as string);
        if (!backupData.data || !backupData.version) {
          throw new Error('Érvénytelen mentési fájl formátum.');
        }
        
        setLoading(true);
        await apiService.restoreSystem(backupData);
        setStatus({ type: 'success', message: 'Rendszer sikeresen visszaállítva a mentésből.' });
        setIsRestoreModalOpen(false);
        // Refresh page to show new data
        setTimeout(() => window.location.reload(), 2000);
      } catch (error) {
        console.error(error);
        setStatus({ type: 'error', message: 'Hiba a visszaállítás során: ' + (error as Error).message });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 border-indigo-100 bg-indigo-50/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Teljes Rendszer Pillanatkép</h3>
              <p className="text-sm text-slate-600 mt-1 max-w-md">
                Ez a funkció egyetlen fájlba menti az összes adatbázis táblát (eladások, készlet, függő tételek, felhasználók). 
                A mentés bármikor visszatölthető a rendszerbe.
              </p>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                <FileArchive className="w-3 h-3" />
                Profi Biztonsági Funkció
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="secondary" 
              onClick={() => setIsRestoreModalOpen(true)}
              className="bg-white border-slate-200 hover:bg-slate-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Visszaállítás
            </Button>
            <Button 
              onClick={handleCreateBackup} 
              isLoading={loading}
              className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100"
            >
              <Download className="w-4 h-4 mr-2" />
              Mentés Létrehozása
            </Button>
          </div>
        </div>

        {status && (
          <div className={cn(
            "mt-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
            status.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
          )}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <p className="text-sm font-medium">{status.message}</p>
          </div>
        )}
      </Card>

      <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 leading-relaxed">
          <p className="font-bold mb-1">Fontos megjegyzés a forráskód mentéséről:</p>
          Ez a funkció az <strong>adatbázis tartalmát</strong> menti. Magát az alkalmazás forráskódját a platform 
          <strong> Settings (Beállítások)</strong> menüjében az <strong>Export to ZIP</strong> vagy 
          <strong> Export to GitHub</strong> opcióval tudja biztonságosan menteni.
        </div>
      </div>

      <Modal 
        isOpen={isRestoreModalOpen} 
        onClose={() => setIsRestoreModalOpen(false)} 
        title="Rendszer Visszaállítása"
      >
        <div className="space-y-6">
          <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 font-medium">
              FIGYELEM! A visszaállítás felülírja a jelenlegi adatbázist a mentésben található adatokkal. 
              Ez a művelet nem vonható vissza!
            </p>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Válassza ki a korábban letöltött <code>.json</code> kiterjesztésű mentési fájlt:
            </p>
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="hidden"
            />
            <Button 
              variant="secondary" 
              className="w-full h-24 border-dashed border-2 flex flex-col gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400" />
                  <span>Kattintson a fájl kiválasztásához</span>
                </>
              )}
            </Button>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setIsRestoreModalOpen(false)}>Mégse</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SystemBackup;
