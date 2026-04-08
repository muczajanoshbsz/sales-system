import React, { useState, useEffect, useRef } from 'react';
import { useFirebase } from './FirebaseProvider';
import { apiService } from '../services/apiService';
import { getChatResponse } from '../services/geminiService';
import { Sale, StockItem, PendingSale } from '../types';
import { Button, Card, Input } from './ui/Base';
import { MessageSquare, Send, Bot, User, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

const BusinessAssistant: React.FC = () => {
  const { user } = useFirebase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<{ sales: Sale[], stock: StockItem[], pendingSales: PendingSale[] }>({
    sales: [],
    stock: [],
    pendingSales: []
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sales, stock, pendingSales] = await Promise.all([
          apiService.getSales(),
          apiService.getStock(),
          apiService.getPendingSales()
        ]);
        setData({ sales, stock, pendingSales });
      } catch (error) {
        console.error("Failed to fetch data for assistant:", error);
      }
    };
    fetchData();
    
    // Load chat history from local storage
    const savedChat = localStorage.getItem('business_chat_history');
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    } else {
      // Initial greeting
      setMessages([{
        role: 'model',
        content: 'Szia! Én vagyok az üzleti asszisztensed. Kérdezz bátran az eladásokról, a készletről vagy kérj tanácsot a beszerzéshez!',
        timestamp: new Date()
      }]);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Save chat history
    if (messages.length > 0) {
      localStorage.setItem('business_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await getChatResponse(input, history, data);
      
      const aiMessage: Message = {
        role: 'model',
        content: response || 'Sajnálom, nem tudtam választ generálni.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    if (window.confirm('Biztosan törölni szeretnéd a beszélgetést?')) {
      setMessages([{
        role: 'model',
        content: 'Szia! Én vagyok az üzleti asszisztensed. Kérdezz bátran az eladásokról, a készletről vagy kérj tanácsot a beszerzéshez!',
        timestamp: new Date()
      }]);
      localStorage.removeItem('business_chat_history');
    }
  };

  const quickQuestions = [
    "Melyik modellt érdemes most vennem?",
    "Mennyi volt a múlt heti hasznom?",
    "Melyik platformon adok el a legtöbbet?",
    "Van olyan termék, ami lassan fogy?",
  ];

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-12rem)] flex flex-col gap-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Üzleti Asszisztens</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">AI alapú tanácsadás és adatelemzés</p>
          </div>
        </div>
        <Button variant="ghost" onClick={clearChat} className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-xl">
          <Trash2 className="w-4 h-4 mr-2" />
          Törlés
        </Button>
      </div>

      <Card className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl rounded-3xl overflow-hidden relative">
        {/* Chat Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex gap-4 max-w-[85%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === 'user' ? "bg-slate-900 text-white" : "bg-indigo-600 text-white"
                )}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
                  msg.role === 'user' 
                    ? "bg-slate-900 dark:bg-black text-white rounded-tr-none" 
                    : "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none"
                )}>
                  <div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  <p className={cn(
                    "text-[10px] mt-2 font-bold uppercase tracking-widest opacity-50",
                    msg.role === 'user' ? "text-right" : "text-left"
                  )}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 mr-auto"
            >
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Gondolkodom...</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Quick Questions */}
        {messages.length < 3 && !isLoading && (
          <div className="px-6 pb-4 flex flex-wrap gap-2">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(q);
                  // Trigger send after state update
                  setTimeout(() => document.getElementById('chat-submit-btn')?.click(), 0);
                }}
                className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-xl border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
          <form onSubmit={handleSend} className="flex gap-3">
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Kérdezz bármit az üzletedről..."
                className="pr-12 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-2xl shadow-inner focus:ring-indigo-500 dark:text-white"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Sparkles className="w-4 h-4 text-indigo-300 dark:text-indigo-700" />
              </div>
            </div>
            <Button 
              id="chat-submit-btn"
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 rounded-2xl px-6"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <p className="text-[10px] text-center text-slate-400 mt-4 font-bold uppercase tracking-widest">
            Az AI tévedhet. Mindig ellenőrizd a fontos adatokat.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default BusinessAssistant;
