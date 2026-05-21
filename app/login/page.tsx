"use client";
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { Phone, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    // Check if the number exists in our profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('whatsapp_number', phone.trim())
      .single();

    if (data) {
      // For testing purposes, we store a temporary "session" in the browser
      localStorage.setItem('fan_verdict_user', JSON.stringify({
        name: data.display_name,
        phone: phone.trim()
      }));
      alert(`Welcome back, ${data.display_name}! Redirecting to Dashboard...`);
      router.push('/');
    } else {
      alert("Phone number not found. Please contact Dinesh (Admin).");
    }
  };

  return (
    <div className="min-h-screen bg-blue-600 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">FanVerdict Login</h1>
        <p className="text-gray-500 mb-8 text-sm">Enter your registered WhatsApp number to access your points and vote.</p>
        
        <div className="relative mb-6">
          <Phone className="absolute left-3 top-3 text-gray-400" size={20} />
          <input 
            type="text"
            placeholder="+91 / +1 ..."
            onChange={(e) => setPhone(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <button 
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition"
        >
          Enter Dashboard <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
