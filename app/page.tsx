"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trophy, Lock, CheckCircle2, XCircle, ChevronDown, ChevronUp, LogOut } from 'lucide-react';

export default function Dashboard() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myVote, setMyVote] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is logged in from our Login Page
    const savedUser = localStorage.getItem('fan_verdict_user');
    if (savedUser) setUser(JSON.parse(savedUser));

    async function fetchData() {
      const { data: profileData } = await supabase.from('profiles').select('*').order('total_points', { ascending: false });
      const { data: matchData } = await supabase.from('matches').select('*').order('game_number', { ascending: false });
      
      if (profileData) setProfiles(profileData);
      if (matchData) setMatches(matchData);
      setLoading(false);
    }
    fetchData();
  }, []);

  const handleVote = async (team: string) => {
    if (!user) return alert("Please login first to vote!");
    
    // Find the current profile ID for the logged in user
    const loggedInProfile = profiles.find(p => p.display_name === user.name);
    const game66 = matches.find(m => m.game_number === 66);

    if (!loggedInProfile || !game66) return alert("Error finding match or profile.");

    const { error } = await supabase.from('votes').upsert({
      user_id: loggedInProfile.id,
      match_id: game66.id,
      selected_team: team,
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id,match_id' });

    if (error) alert("Error saving vote: " + error.message);
    else {
      setMyVote(team);
      alert(`Successfully voted for ${team}!`);
    }
  };

  if (loading) return <div className="p-10 text-center">Loading Dashboard...</div>;

  const displayedMatches = isExpanded ? matches : matches.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50 pb-10 font-sans">
      <nav className="bg-blue-600 p-4 text-white shadow-md">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={24} /> FanVerdict IPL</h1>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold bg-blue-700 px-3 py-1 rounded italic">{user.name}</span>
              <button onClick={() => {localStorage.clear(); window.location.reload();}} className="text-xs opacity-70"><LogOut size={16}/></button>
            </div>
          ) : (
            <a href="/login" className="text-sm font-bold underline">Login</a>
          )}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        <section className="bg-white rounded-xl shadow-sm p-6 border border-blue-100">
          <h2 className="text-lg font-bold mb-4">Game 66: GT vs CSK</h2>
          <div className="flex items-center justify-around bg-gray-50 p-6 rounded-lg border-2 border-blue-200">
            <div className="text-center">
              <div className="text-3xl font-black text-blue-900">GT</div>
              <button 
                onClick={() => handleVote('TeamA')}
                className={`mt-4 px-6 py-2 rounded-full font-bold transition ${myVote === 'TeamA' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                {myVote === 'TeamA' ? '✓ Voted' : 'Vote GT'}
              </button>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-yellow-600">CSK</div>
              <button 
                onClick={() => handleVote('TeamB')}
                className={`mt-4 px-6 py-2 rounded-full font-bold transition ${myVote === 'TeamB' ? 'bg-green-500 text-white' : 'border-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50'}`}
              >
                {myVote === 'TeamB' ? '✓ Voted' : 'Vote CSK'}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <h2 className="font-bold">Standings & History</h2>
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-sm text-blue-600 font-bold">
              {isExpanded ? <ChevronUp/> : <ChevronDown/>} {isExpanded ? 'Show Last 5' : 'Show All'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-400 bg-gray-50 uppercase">
                  <th className="p-4">Rank & Name</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Acc %</th>
                  {displayedMatches.map(m => <th key={m.id} className="p-4 text-center">G{m.game_number}</th>)}
                </tr>
              </thead>
              <tbody className="text-sm">
                {profiles.map((p, index) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-4 font-semibold">#{index+1} {p.display_name}</td>
                    <td className="p-4 font-bold text-blue-600">{p.total_points}</td>
                    <td className="p-4 text-gray-500">{p.accuracy_percent}%</td>
                    {displayedMatches.map(m => (
                      <td key={m.id} className="p-4 text-center">
                        {m.status === 'completed' ? <CheckCircle2 size={16} className="mx-auto text-gray-300"/> : <span className="text-gray-200">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
