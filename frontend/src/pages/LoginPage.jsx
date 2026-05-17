import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Eye, EyeOff, ArrowRight, User } from 'lucide-react';
import BackgroundAnimation from '../components/BackgroundAnimation';
import image from '../assets/logo.png'

const LoginPage = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const CORRECT_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD || 'finwise2026';

    const handleSubmit = (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Simulate a brief loading state
        setTimeout(() => {
            if (password === CORRECT_PASSWORD) {
                // Store login state and name in localStorage
                if (name === 'admin') {
                    localStorage.setItem('isAdmin', "true");
                    localStorage.setItem('isLoggedIn', "true");
                    localStorage.setItem('userName', name || 'User');
                    navigate('/menu');
                }
                else {
                    localStorage.setItem('isAdmin', "false");
                    localStorage.setItem('isLoggedIn', "true");
                    localStorage.setItem('userName', name || 'User'); // Default to 'User' if empty
                    navigate('/menu');
                }

            } else {
                setError('Incorrect password. Try again.');
                setIsLoading(false);
            }
        }, 500);
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6 overflow-hidden relative">
            <BackgroundAnimation />

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md">
                <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_0_60px_rgba(16,185,129,0.1)]">

                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center  mb-4 cursor-pointer">
                            <img
                                onClick={() => {
                                    navigate("/")
                                }} 
                                src={image} 
                                alt="Logo" 
                                className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Name Field */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Name</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                                    required
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <User size={20} />
                                </div>
                            </div>
                        </div>

                        {/* Password Field */}
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className="w-full pl-12 pr-12 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                    <Sparkles size={20} />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || !password || !name}
                            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-500 to-green-400 text-black font-semibold rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_50px_rgba(16,185,129,0.6)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : (
                                <>
                                    Continue
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="text-center text-white text-xs mt-4">
                        By Logging in I accept the <span onClick={() => navigate('/terms-of-service')} className='text-emerald-500 hover:text-emerald-400 px-1 cursor-pointer'>Terms of Service</span> and <span onClick={() => navigate('/privacy-policy')} className='text-emerald-500 hover:text-emerald-400 px-1 cursor-pointer'>Privacy Policy</span>
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-2xl pointer-events-none" />
            </div>
        </div>
    );
};

export default LoginPage;
