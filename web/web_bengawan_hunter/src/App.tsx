import { useState, useEffect, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type CheckResponse = {
  success: boolean;
  is_available: boolean;
  logs: string[];
  data: BengawanData | null;
};

type BengawanData = {
  name: string;
  price: string;
  remaining_seats: string;
  departure_time: string;
  arrival_time: string;
  departure_date: string;
  arrival_date: string;
  duration: string;
  class: string;
  departure_station?: string;
  arrival_station?: string;
  status_text?: string;
};

type Stats = {
  check_count: number;
  last_check_at: Date | null;
  next_check_at: number | null;
};

function App() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);

  const [logs, setLogs] = useState<string[]>([]);
  const [alertData, setAlertData] = useState<BengawanData | null>(null);
  const [journeyInfo, setJourneyInfo] = useState<BengawanData | null>(null);

  const [stats, setStats] = useState<Stats>({
    check_count: 0,
    last_check_at: null,
    next_check_at: null,
  });

  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(null);
  const runningRef = useRef(running);

  // Update ref setiap state running berubah
  useEffect(() => {
    runningRef.current = running;
    if (!running) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCountdown(0);
      setStats((prev) => ({ ...prev, next_check_at: null }));
    } else {
      // Start first check immediately
      runCheckCycle();
    }
  }, [running]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Permission Notification saat load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Countdown Effect
  useEffect(() => {
    if (!running || !stats.next_check_at) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((stats.next_check_at! - now) / 1000));
      setCountdown(diff);

      // Jika waktu habis, trigger check berikutnya
      if (diff === 0 && !isLoading) {
        clearInterval(interval);
        runCheckCycle();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [running, stats.next_check_at, isLoading]);

  const runCheckCycle = useCallback(async () => {
    if (!runningRef.current) return;

    setIsLoading(true);

    try {
      // 1. FETCH KE API (Vercel Function)
      const res = await fetch(`${API_URL}/check-availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const result: CheckResponse = await res.json();
      console.log(result);

      // 2. UPDATE LOGS
      if (result.logs && result.logs.length > 0) {
        setLogs((prev) => [...prev, ...result.logs]); // Append logs baru
      }

      // 3. UPDATE DATA JIKA ADA
      if (result.data) {
        // Simpan info perjalanan (sekali saja atau update tiap kali ketemu)
        setJourneyInfo(result.data);

        // 4. CEK KETERSEDIAAN
        if (result.is_available) {
          handleAlert(result.data);
        }
      }

      // 5. UPDATE STATS
      setStats((prev) => ({
        ...prev,
        check_count: prev.check_count + 1,
        last_check_at: new Date(),
      }));
    } catch (err) {
      const errorMsg = (err as Error).message;
      setLogs((prev) => [...prev, `Error: ${errorMsg}`]);
    } finally {
      setIsLoading(false);

      // 6. JADWALKAN CHECK BERIKUTNYA (Random 3-5 Menit)
      if (runningRef.current) {
        // Random antara 180s (3 menit) sampai 300s (5 menit)
        // const minWait = 180000;
        // const maxWait = 300000;

        // FOR DEMO/DEBUG: Pakai 10-20 detik biar gak lama nunggu
        // Ganti ke 180000/300000 kalau mau deploy beneran
        const minWait = 180000;
        const maxWait = 300000;

        const randomDelay = Math.floor(
          Math.random() * (maxWait - minWait + 1) + minWait
        );
        const nextTime = Date.now() + randomDelay;

        setStats((prev) => ({ ...prev, next_check_at: nextTime }));
        setLogs((prev) => [...prev, `Waiting, watch the timer dude`]);
      }
    }
  }, [url]);

  // --- HANDLING ALERTS ---

  const handleAlert = (data: BengawanData) => {
    setAlertData(data);

    // Browser notification
    if (Notification.permission === "granted") {
      const notif = new Notification("TIKET TERSEDIA!", {
        body: `${data.name} - ${data.price}\n${
          data.remaining_seats || "Available"
        } seats left!`,
        icon: "/train-icon.png",
        requireInteraction: true,
        tag: "bengawan-alert",
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    }

    playAlertSound();
    document.body.classList.add("alert-flash");
    setTimeout(() => document.body.classList.remove("alert-flash"), 3000);
  };

  const playAlertSound = () => {
    try {
      const context = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const beep = (startTime: number) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain);
        gain.connect(context.destination);
        osc.frequency.value = 800;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
        osc.start(startTime);
        osc.stop(startTime + 0.5);
      };
      for (let i = 0; i < 10; i++) beep(context.currentTime + i * 0.4);
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  // --- HANDLERS UI ---

  const handleStart = () => {
    if (!url.trim().startsWith("http")) {
      alert("Masukkan URL booking KAI yang valid (http/https)");
      return;
    }
    setLogs([]); // Reset logs
    setStats({ check_count: 0, last_check_at: null, next_check_at: null });
    setAlertData(null);
    setRunning(true); // Ini akan trigger useEffect yang memanggil runCheckCycle
  };

  const handleStop = () => {
    setRunning(false);
    setLogs((prev) => [...prev, "Stopped by user"]);
  };

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return "";

    const date = new Date(dateStr);

    // Cek valid gak tanggalnya, kalau nggak valid balikin aslinya aja
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2 tracking-tight">
            Bengawan Ticket Hunter
          </h1>
        </div>

        {/* Journey Info (Show after first successful fetch) */}
        {journeyInfo && (
          <div id="ticket-card">
            {/* 
              BAGIAN 1: Extended Info (Nama, Harga, Durasi) 
              Teknik: Grid Wrapper untuk animasi height yang smooth 
            */}
            <div className="grid-wrapper">
              <div className="overflow-hidden min-h-0">
                {" "}
                {/* min-h-0 penting buat grid trick */}
                {/* Konten ini akan di-blur & fade saat collapse */}
                <div className="content-inner p-4 pb-2 flex justify-between items-start border-b border-slate-100/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🚆</span>
                      <div>
                        <div className="font-bold text-base text-green-900">
                          {journeyInfo.name}
                        </div>
                        <div className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded w-fit">
                          {journeyInfo.class}
                        </div>
                      </div>
                    </div>
                    {/* Stations & Duration (Visible in Full Mode) */}
                    <div className="mt-2 text-xs text-slate-600">
                      <p>
                        {journeyInfo.departure_station} ➝{" "}
                        {journeyInfo.arrival_station}
                      </p>
                      <p className="text-[0.65rem] text-slate-400">
                        Durasi: {journeyInfo.duration}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">
                      {journeyInfo.price}
                    </div>
                    <div className="text-[0.6rem] text-slate-400">/pax</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 
              BAGIAN 2: Core Info (Waktu & Tanggal) 
              Selalu muncul di bawah
            */}
            <div className="p-4 flex justify-between items-center relative z-10 bg-white">
              <div className="text-center">
                <div className="font-bold text-xl text-slate-800">
                  {journeyInfo.departure_time}
                </div>
                <div className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-widest">
                  {formatShortDate(journeyInfo.departure_date)}
                </div>
              </div>

              <div className="opacity-20 text-slate-900 text-lg">⟶</div>

              <div className="text-center">
                <div className="font-bold text-xl text-slate-800">
                  {journeyInfo.arrival_time}
                </div>
                <div className="text-[0.6rem] font-semibold text-slate-400 uppercase tracking-widest">
                  {formatShortDate(journeyInfo.arrival_date)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Input & Controls */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2 text-sm uppercase tracking-wide">
              KAI Search URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://booking.kai.id/search?origination=..."
              disabled={running}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-50 transition-all"
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 text-slate-600 h-8">
              {isLoading && (
                <>
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium animate-pulse">
                    Fetching data...
                  </span>
                </>
              )}
            </div>

            <div className="flex gap-3 w-full sm:w-auto">
              {!running ? (
                <button
                  onClick={handleStart}
                  className="w-full text-sm sm:w-auto bg-slate-900 hover:bg-slate-600 text-white font-medium px-8 py-2.5 rounded-xl transition-colors shadow-lg shadow-slate-900/20"
                >
                  Start Monitoring
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full text-sm sm:w-auto border-2 border-red-100 bg-red-50 hover:bg-red-100 text-red-600 font-medium px-8 py-2.5 rounded-xl transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Alert Banner */}
        {alertData && (
          <div className="bg-green-50 border border-green-200 text-slate-900 p-6 rounded-2xl shadow-xl mb-6 relative animate-bounce-slow">
            <button
              onClick={() => setAlertData(null)}
              className="absolute top-4 right-4 text-green-700 hover:bg-green-100 px-1.5 rounded-full"
            >
              ✕
            </button>
            <div className="text-2xl font-black text-green-700 mb-1 flex items-center gap-2">
              TICKET AVAILABLE!
            </div>

            <div className="bg-white/80 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-green-600 text-xs font-bold uppercase">
                  Price
                </div>
                <div className="font-bold text-lg">{alertData.price}</div>
              </div>
              <div>
                <div className="text-green-600 text-xs font-bold uppercase">
                  Seats
                </div>
                <div className="font-bold text-lg">
                  {alertData.remaining_seats || "Available"}
                </div>
              </div>
              <div>
                <div className="text-green-600 text-xs font-bold uppercase">
                  Departure
                </div>
                <div className="font-bold">
                  {alertData.departure_date}{" "}
                  <span className="text-xs">({alertData.departure_time})</span>
                </div>
                <div></div>
              </div>
              <div>
                <div className="text-green-600 text-xs font-bold uppercase">
                  Arrival
                </div>
                <div className="font-bold">
                  {alertData.arrival_date}{" "}
                  <span className="text-xs">({alertData.arrival_time})</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Countdown Card */}
          <div className="md:row-span-3 bg-slate-900 text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-xl overflow-hidden">
            <div className="text-slate-400 font-medium uppercase tracking-widest text-xs mb-4">
              Next Check In
            </div>
            <div className="text-7xl font-mono font-bold mb-6 tracking-tighter">
              {formatCountdown(countdown)}
            </div>

            <button
              onClick={() => runCheckCycle()}
              disabled={isLoading}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-2 rounded-full transition-all backdrop-blur-sm border border-white/10"
            >
              Force Check Now
            </button>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between border border-slate-100">
            <div>
              <div className="text-3xl font-bold text-slate-800">
                {stats.check_count}
              </div>
              <div className="text-xs text-slate-500 font-bold uppercase">
                Checks Performed
              </div>
            </div>
            <div className="text-2xl">🔍</div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between border border-slate-100">
            <div>
              <div className="text-xl font-bold text-slate-800">
                {stats.last_check_at
                  ? stats.last_check_at.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })
                  : "-"}
              </div>
              <div className="text-xs text-slate-500 font-bold uppercase">
                Last Execution
              </div>
            </div>
            <div className="text-2xl">⏱️</div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between border border-slate-100">
            <div>
              <div className="text-xl font-bold text-slate-800">
                {stats.next_check_at
                  ? new Date(stats.next_check_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })
                  : "-"}
              </div>
              <div className="text-xs text-slate-500 font-bold uppercase">
                Scheduled At
              </div>
            </div>
            <div className="text-2xl">📅</div>
          </div>
        </div>

        {/* Logs Terminal */}
        <div className="bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
          <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="text-slate-500 text-xs font-mono">terminal.log</div>
            <button
              onClick={() => setLogs([])}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              CLEAR
            </button>
          </div>
          <div className="p-4 h-64 overflow-y-auto font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center py-20 italic">
                System ready. Waiting for start command...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-slate-300 break-all flex gap-2">
                  <span className="text-slate-600 select-none">{">"}</span>
                  <span>{log}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="mt-8 text-center text-slate-400 text-sm">
          <p>Keep this tab open.</p>
        </div>
      </div>

      <style>{`
        /* --- CONTAINER UTAMA --- */
        #ticket-card {
          position: fixed;
          z-index: 100;
          left: 50%;
          
          /* 1. SET DEFAULT KE POSISI PARKIR (Kondisi Akhir) */
          bottom: 4vh; 
          transform: translateX(-50%); /* Hapus translate Y, cukup X */
          width: 320px;
          max-width: 320px;
          
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(226, 232, 240, 0.8);
          border-radius: 1.25rem;
          box-shadow: 0 10px 40px -10px rgba(0,0,0,0.1);
          
          overflow: hidden;
          cursor: pointer;

          /* 2. HAPUS 'forwards' */
          /* Setelah 4.5s, dia akan 'jatuh' ke style default di atas (yang sama persis) */
          animation: entranceSequence 4.5s cubic-bezier(0.22, 1, 0.36, 1);

          /* Transisi sekarang bakal jalan mulus */
          transition: 
            width 0.6s cubic-bezier(0.25, 1, 0.5, 1),
            box-shadow 0.4s ease,
            transform 0.4s ease,
            max-width 0.6s ease; /* Tambahin ini biar smooth juga */
        }

        /* --- GRID TRICK --- */
        #ticket-card .grid-wrapper {
          display: grid;
          /* Default: COLLAPSED (0fr) */
          grid-template-rows: 0fr;
          
          transition: grid-template-rows 0.6s cubic-bezier(0.25, 1, 0.5, 1);
          
          /* Hapus forwards */
          animation: contentCollapseSequence 4.5s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* --- CONTENT --- */
        #ticket-card .content-inner {
          /* Default: HIDDEN (Sesuai Parkir) */
          opacity: 0;
          filter: blur(8px);
          transform: translateY(10px);
          
          transition: 
            opacity 0.5s ease, 
            filter 0.5s ease,
            transform 0.5s cubic-bezier(0.25, 1, 0.5, 1);

          /* Hapus forwards */
          animation: contentFadeSequence 4.5s cubic-bezier(0.22, 1, 0.36, 1);
        }


        /* --- INTERAKSI: HOVER (Gak perlu !important lagi) --- */

        #ticket-card:hover .grid-wrapper {
          grid-template-rows: 1fr; 
        }

        #ticket-card:hover .content-inner {
          opacity: 1;
          filter: blur(0px);
          transform: translateY(0px);
          transition-delay: 0.1s; 
        }

        #ticket-card:hover {
          width: 90vw;
          max-width: 400px;
          box-shadow: 0 20px 40px -5px rgb(0, 201, 81, 0.2);
        }

        /* --- KEYFRAMES (Sedikit penyesuaian di 100%) --- */
        /* Pastikan 100% SAMA PERSIS dengan style default di atas */

        @keyframes entranceSequence {
          0% {
            bottom: -200px;
            width: 300px;
            max-width: 300px;
          }
          20%, 60% {
            bottom: 50%;
            transform: translate(-50%, 50%); /* Naik ke tengah */
            width: 90vw;
            max-width: 600px;
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.3);
          }
          100% {
            bottom: 4vh;
            transform: translate(-50%, 0); /* Reset Y */
            width: 320px;
            max-width: 320px;
            /* Di sini animasi selesai, CSS Default ambil alih */
          }
        }

        @keyframes contentCollapseSequence {
          0%, 60% { grid-template-rows: 1fr; }
          100% { grid-template-rows: 0fr; }
        }

        @keyframes contentFadeSequence {
          0%, 60% { 
            opacity: 1; 
            filter: blur(0px); 
            transform: translateY(0);
          }
          100% { 
            opacity: 0; 
            filter: blur(8px); 
            transform: translateY(10px);
          }
        }

        @keyframes flash {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(34, 197, 94, 0.2); }
        }
        .alert-flash {
          animation: flash 0.5s ease-in-out 6;
        }
        
        /* Custom Scrollbar agar terlihat hacker-style */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #0f172a; 
        }
        ::-webkit-scrollbar-thumb {
          background: #334155; 
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #475569; 
        }

        .animate-bounce-slow {
          animation: bounce 2s infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}

export default App;
