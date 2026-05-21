"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Lock, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function Dashboard() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Data from Supabase
  useEffect(() => {
    async function fetchData() {
      // Get Standings
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .order('total_points', { ascending: false });

      // Get Matches
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .order('game_number', { ascending: false });

      if (profileData) setProfiles(profileData);
      if (matchData) setMatches(matchData);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <div className="p-10 text-center font-sans">Loading FanVerdict Dashboard...</div>;

  // Logic to handle Last 5 vs All Games
  const displayedMatches = isExpanded ? matches : matches.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 pb-10 font-sans">
      {/* HEADER */}
      <nav className="bg-blue-600 p-4 text-white shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Trophy size={24} /> FanVerdict IPL 2026
          </h1>
          <div className="text-sm bg-blue-700 px-3 py-1 rounded">Dinesh (Admin)</div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        
        {/* VOTE SECTION (GAME 66) */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-blue-100">
          <h2 className="text-lg font-bold mb-4 text-gray-800">Next Game: Poll</h2>
          <div className="flex items-center justify-around bg-gray-50 p-6 rounded-lg border-2 border-dashed border-blue-200">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-900">GT</div>
              <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 transition">Vote GT</button>
            </div>
            <div className="text-xl font-bold text-gray-400 italic">VS</div>
            <div className="text-center">
              <div className="text-3xl font-black text-yellow-600">CSK</div>
              <button className="mt-4 px-6 py-2 border-2 border-yellow-500 text-yellow-600 rounded-full font-bold hover:bg-yellow-50 transition">Vote CSK</button>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 mt-4 flex items-center justify-center gap-1">
            <Lock size={12} /> Poll locks at the start of the first ball.
          </p>
        </section>

        {/* LEADERBOARD & GRID */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <h2 className="font-bold text-gray-700">Leaderboard & Recent Performance</h2>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm flex items-center gap-1 text-blue-600 font-semibold hover:underline"
            >
              {isExpanded ? <><ChevronUp size={16}/> Show Last 5</> : <><ChevronDown size={16}/> Show All Games</>}
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase text-gray-400 bg-gray-50">
                  <th className="p-4 border-b">Rank & Name</th>
                  <th className="p-4 border-b">Total</th>
                  <th className="p-4 border-b">Acc %</th>
                  {displayedMatches.map((m) => (
                    <th key={m.id} className="p-4 border-b text-center">G{m.game_number}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {profiles.map((user, index) => (
                  <tr key={user.id} className="hover:bg-gray-50 border-b last:border-0">
                    <td className="p-4">
                      <span className="font-bold text-gray-400 mr-2">#{index + 1}</span>
                      <span className="font-semibold text-gray-800">{user.display_name}</span>
                    </td>
                    <td className="p-4 font-bold text-blue-600">{user.total_points}</td>
                    <td className="p-4 text-gray-500">{user.accuracy_percent}%</td>
                    
                    {/* Placeholder Grid Icons */}
                    {displayedMatches.map((m) => (
                      <td key={m.id} className="p-4 text-center">
                        {/* Note: This is simulated for now. Real logic will check votes table */}
                        {m.status === 'completed' ? (
                          Math.random() > 0.5 ? <CheckCircle2 size={18} className="text-green-500 mx-auto" /> : <XCircle size={18} className="text-red-400 mx-auto" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      
      <footer className="text-center p-10 text-gray-400 text-xs">
        Powered by FanVerdict Engine • Ongoing Tournament: IPL 2026
      </footer>
    </div>
  );
}
