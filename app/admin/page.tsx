"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldAlert, Edit3, Save, RotateCcw } from 'lucide-react';

export default function AdminPortal() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [newPoints, setNewPoints] = useState<number>(0);

  useEffect(() => {
    async function fetchAdminData() {
      const { data: p } = await supabase.from('profiles').select('*').order('display_name');
      const { data: m } = await supabase.from('matches').select('*').order('game_number', { ascending: false });
      if (p) setProfiles(p);
      if (m) setMatches(m);
    }
    fetchAdminData();
  }, []);

  const handleOverride = async () => {
    if (!selectedUser) return alert("Select a user first");
    
    const { error } = await supabase
      .from('profiles')
      .update({ total_points: newPoints })
      .eq('id', selectedUser);

    if (error) alert("Error updating points");
    else {
        alert("Points Updated Successfully! Refresh the dashboard to see changes.");
        window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center gap-3 mb-8">
          <ShieldAlert className="text-red-600" size={32} />
          <h1 className="text-3xl font-bold">Admin God-Mode Console</h1>
        </header>

        <div className="grid gap-6">
          {/* OVERRIDE CARD */}
          <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-red-500">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Edit3 size={20}/> Manual Points Override
            </h2>
            <p className="text-sm text-gray-500 mb-6">Use this to manually adjust points for any participant (e.g., Bonuses or Dispute resolution).</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Select Participant</label>
                <select 
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full p-3 border rounded-lg bg-gray-50"
                >
                  <option value="">-- Choose User --</option>
                  {profiles.map(u => (
                    <option key={u.id} value={u.id}>{u.display_name} (Current: {u.total_points} pts)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">New Point Total</label>
                <input 
                  type="number" 
                  placeholder="Enter new total points"
                  onChange={(e) => setNewPoints(parseInt(e.target.value))}
                  className="w-full p-3 border rounded-lg"
                />
              </div>

              <button 
                onClick={handleOverride}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 transition flex items-center justify-center gap-2"
              >
                <Save size={18} /> Push Update to Leaderboard
              </button>
            </div>
          </div>

          {/* RECENT MATCHES LOG */}
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <RotateCcw size={20}/> Match Status Control
            </h2>
            <div className="divide-y">
              {matches.slice(0, 5).map(m => (
                <div key={m.id} className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-bold">G{m.game_number}:</span> {m.team_a} vs {m.team_b}
                  </div>
                  <div className="text-sm px-2 py-1 bg-gray-100 rounded text-gray-500 uppercase font-bold">
                    {m.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
