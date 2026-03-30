import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  Search, 
  Shield, 
  Lock, 
  Globe,
  Settings,
  Zap,
  MoreVertical,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Internal types
type TabState = {
  id: string;
  url: string | null;
  title: string;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
};

export default function Browser() {
  // State for the active browser session
  const [urlInput, setUrlInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync input bar with current URL when navigating back/forward
  useEffect(() => {
    if (currentUrl) {
      setUrlInput(currentUrl);
    } else {
      setUrlInput("");
    }
  }, [currentUrl]);

  const handleNavigate = (input: string) => {
    if (!input.trim()) return;
    
    let finalUrl = input.trim();
    
    // Simple heuristic: if it has spaces or doesn't have a dot, treat as search
    if (!finalUrl.includes('.') || finalUrl.includes(' ')) {
      finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(finalUrl)}`;
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(finalUrl);
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setCurrentUrl(finalUrl);
    setIsLoading(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNavigate(urlInput);
      (e.target as HTMLInputElement).blur();
    }
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentUrl(history[historyIndex - 1]);
      setIsLoading(true);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentUrl(history[historyIndex + 1]);
      setIsLoading(true);
    }
  };

  const reload = () => {
    if (!currentUrl) return;
    setIsLoading(true);
    if (iframeRef.current) {
      // Force reload by resetting src
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = currentSrc;
      }, 50);
    }
  };

  const goHome = () => {
    setCurrentUrl(null);
    setUrlInput("");
    setIsLoading(false);
  };

  // Listen for postMessage from proxied pages (injected script in proxy backend)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      const { type, url } = event.data;
      if (type === "PROXY_URL" && url) {
        setUrlInput(url);
        setCurrentUrl(url);
      } else if (type === "PROXY_NAVIGATE" && url) {
        handleNavigate(url);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [history, historyIndex]);

  // Listen to iframe load events
  const handleIframeLoad = () => {
    setIsLoading(false);
    
    try {
      // Attempt to read current URL if the proxy kept it same-origin
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const searchParams = new URLSearchParams(iframeRef.current.contentWindow.location.search);
        const proxiedUrl = searchParams.get('url');
        
        if (proxiedUrl && proxiedUrl !== currentUrl) {
          // User navigated within the iframe
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(proxiedUrl);
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
          setCurrentUrl(proxiedUrl);
        }
      }
    } catch (e) {
      // Cross-origin or other error, fallback to assuming it's still currentUrl
      console.warn("Could not sync proxy URL from iframe", e);
    }
  };

  // Quick action bookmarks
  const bookmarks = [
    { name: "DuckDuckGo", url: "https://duckduckgo.com", icon: Search },
    { name: "Wikipedia", url: "https://wikipedia.org", icon: Globe },
    { name: "YouTube", url: "https://youtube.com", icon: Zap },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans">
      
      {/* Chrome / Address Bar Area */}
      <div className="relative z-50 glass-panel flex flex-col pt-2">
        {/* Fake window controls / tabs area */}
        <div className="flex items-center px-4 h-8 space-x-2">
          <div className="flex space-x-2 mr-4">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          
          {/* Active Tab */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-t-lg px-4 py-1.5 min-w-[200px] max-w-[240px] relative top-[1px]">
            <Globe className="w-3.5 h-3.5 text-primary mr-2" />
            <span className="text-xs text-foreground/80 truncate flex-1 font-medium">
              {currentUrl ? new URL(currentUrl).hostname : "New Tab"}
            </span>
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-white cursor-pointer" onClick={goHome} />
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="flex items-center px-3 py-2 space-x-2 bg-white/5 border-t border-white/5">
          <div className="flex items-center space-x-1">
            <Button 
              variant="icon" 
              onClick={goBack} 
              disabled={historyIndex <= 0}
              title="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button 
              variant="icon" 
              onClick={goForward} 
              disabled={historyIndex >= history.length - 1}
              title="Go forward"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button 
              variant="icon" 
              onClick={reload} 
              disabled={!currentUrl}
              title="Reload page"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
            </Button>
            <Button 
              variant="icon" 
              onClick={goHome}
              title="Home"
            >
              <Home className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 max-w-4xl mx-auto relative group">
            <div className={`absolute inset-0 bg-primary/20 blur-xl rounded-full transition-opacity duration-500 pointer-events-none ${isFocused ? 'opacity-100' : 'opacity-0'}`} />
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search or enter web address"
              className="text-center transition-all bg-black/40 hover:bg-black/60 focus:bg-black/80 font-mono text-sm tracking-wide"
              icon={<Shield className="w-4 h-4 text-green-400" />}
            />
            {currentUrl && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                 <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <Button variant="icon" title="Extensions">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="icon" title="Settings">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Loading Progress Bar */}
        <div className="h-[2px] w-full bg-transparent absolute bottom-0 left-0 overflow-hidden z-50">
          <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.5 } }}
                className="h-full w-full bg-primary/20"
              >
                <div className="h-full bg-primary w-full animate-progress" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative bg-black">
        {currentUrl ? (
          <iframe
            ref={iframeRef}
            src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
            className="w-full h-full border-none bg-white"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
            onLoad={handleIframeLoad}
            title="Proxy View"
          />
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Cool background image */}
            <div 
              className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none"
              style={{
                backgroundImage: `url('${import.meta.env.BASE_URL}images/tech-bg.png')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
            
            {/* Radial gradient overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-background/40 via-background/90 to-background pointer-events-none" />

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="relative z-10 flex flex-col items-center max-w-2xl px-6 text-center"
            >
              <div className="w-20 h-20 mb-8 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-white/10 flex items-center justify-center shadow-2xl shadow-primary/20 backdrop-blur-xl">
                <Shield className="w-10 h-10 text-primary" />
              </div>
              
              <h1 className="text-5xl md:text-6xl font-black mb-4 font-display bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/40">
                Incognito Proxy
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-lg font-light leading-relaxed">
                Bypass restrictions, browse securely, and leave no trace. 
                Enter any URL above to get started.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                {bookmarks.map((bm, i) => (
                  <motion.button
                    key={bm.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + (i * 0.1) }}
                    onClick={() => handleNavigate(bm.url)}
                    className="flex flex-col items-center justify-center p-6 rounded-xl bg-white/5 border border-white/5 hover:border-primary/30 hover:bg-white/10 transition-all duration-300 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-300">
                      <bm.icon className="w-5 h-5 text-primary group-hover:text-white transition-colors" />
                    </div>
                    <span className="font-medium text-sm text-foreground/80 group-hover:text-white">{bm.name}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
