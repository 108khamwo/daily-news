import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Download, Copy, Image as ImageIcon, Plus, Clock, Calendar, Check, RotateCcw, Edit2, Trash2, ChevronDown, Info } from 'lucide-react';

// ==========================================
// 1. Firebase Initialization (ใช้รหัสโปรเจกต์ Newsupdate ของคุณ)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCTDyqdyIzXnH6GUSZ-c2oj4uf9YRvVzho",
  authDomain: "newsupdate-618af.firebaseapp.com",
  projectId: "newsupdate-618af",
  storageBucket: "newsupdate-618af.firebasestorage.app",
  messagingSenderId: "904029958760",
  appId: "1:904029958760:web:8b36e4723e89b9f50741dd",
  measurementId: "G-8M70Q4MVHH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'daily-news-app';

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

// ==========================================
// 2. Helper Functions
// ==========================================

// ฟังก์ชันประมวลผลรูปภาพ (บีบอัดเฉพาะไฟล์ที่ใหญ่กว่า 700KB)
const processImage = (file, maxSizeKB = 700) => {
  return new Promise((resolve, reject) => {
    if (file.size <= maxSizeKB * 1024) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    } else {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let maxWidth = 1200; 
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
      reader.onerror = (error) => reject(error);
    }
  });
};

// ฟังก์ชันคำนวณช่วงสัปดาห์ (จันทร์ - อาทิตย์)
const getWeekInfo = (timestamp) => {
  const d = new Date(timestamp);
  const day = d.getDay() === 0 ? 7 : d.getDay(); 
  const start = new Date(d);
  start.setDate(d.getDate() - day + 1);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startStr = start.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return { key: start.getTime(), label: `${startStr} - ${endStr}` };
};

// ==========================================
// 3. Components หลัก
// ==========================================

export default function App() {
  const [user, setUser] = useState(null);
  const [news, setNews] = useState([]);
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const hasCleanedUp = useRef(false);

  // ระบบตรวจสอบสิทธิ์เบื้องต้น
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        setUser({ uid: 'anonymous-user' });
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ดึงข้อมูลจาก Firestore
  useEffect(() => {
    if (!user) return;
    const newsRef = collection(db, 'artifacts', appId, 'public', 'data', 'news');
    const unsubscribe = onSnapshot(newsRef, (snapshot) => {
      const newsData = [];
      snapshot.forEach((doc) => {
        newsData.push({ id: doc.id, ...doc.data() });
      });
      newsData.sort((a, b) => b.timestamp - a.timestamp);
      setNews(newsData);

      // ระบบลบข่าวเก่าอัตโนมัติ (เกิน 30 วัน)
      if (!hasCleanedUp.current && newsData.length > 0) {
        hasCleanedUp.current = true;
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        newsData.forEach(item => {
           if(item.timestamp < thirtyDaysAgo) {
               deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id)).catch(e => console.error(e));
           }
        });
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleEdit = (item) => {
    setEditingItem(item);
    setView('admin');
  };

  const handleGoHome = () => {
    setEditingItem(null);
    setView('dashboard');
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
      <p className="text-gray-500 font-medium">กำลังโหลดข้อมูลระบบข่าว...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-blue-200">
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={handleGoHome}>
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Calendar size={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-800 hidden sm:block">
              รวมข่าวประจำวัน
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {view === 'admin' ? (
               <button onClick={handleGoHome} className="text-gray-600 hover:text-blue-600 transition font-medium">กลับหน้าหลัก</button>
            ) : (
               <button onClick={() => setView('admin')} className="flex items-center space-x-1 text-sm bg-blue-50 text-blue-600 px-4 py-2 rounded-full hover:bg-blue-100 transition font-bold shadow-sm">
                 <Plus size={18} /> <span>เพิ่มข่าวใหม่</span>
               </button>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === 'dashboard' && <Dashboard news={news} onEdit={handleEdit} />}
        {view === 'admin' && <AdminPanel setView={handleGoHome} editingItem={editingItem} />}
      </main>
    </div>
  );
}

// ส่วนแสดงผลหน้าแรก (Dashboard)
function Dashboard({ news, onEdit }) {
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const weeksMap = new Map();
  news.forEach(item => {
     const { key, label } = getWeekInfo(item.timestamp);
     if (!weeksMap.has(key)) weeksMap.set(key, label);
  });
  const sortedWeekKeys = Array.from(weeksMap.keys()).sort((a,b) => b - a);
  
  useEffect(() => {
    if (sortedWeekKeys.length > 0 && !selectedWeekKey) {
      setSelectedWeekKey(sortedWeekKeys[0].toString());
    }
  }, [sortedWeekKeys, selectedWeekKey]);

  if (news.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-gray-100">
        <ImageIcon size={64} className="mx-auto text-gray-200 mb-4" />
        <h2 className="text-xl font-semibold text-gray-600">ยังไม่มีข่าวในระบบ</h2>
        <p className="text-gray-400 mt-2">กดปุ่ม "เพิ่มข่าวใหม่" เพื่อเริ่มต้นจัดการข้อมูล</p>
      </div>
    );
  }

  const filteredNews = news.filter(item => {
    const { key } = getWeekInfo(item.timestamp);
    return key.toString() === selectedWeekKey;
  });

  const groupedNews = filteredNews.reduce((acc, item) => {
    const date = item.dateString;
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});
  const displayDates = Object.keys(groupedNews);

  return (
    <div className="space-y-8">
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-gray-600 font-bold">
          <Calendar size={20} className="mr-2 text-blue-500" />
          <span>ข่าวประจำช่วงสัปดาห์:</span>
        </div>
        <div className="relative w-full sm:w-80">
          <select 
            value={selectedWeekKey}
            onChange={(e) => setSelectedWeekKey(e.target.value)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-3 px-5 pr-12 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-bold shadow-sm"
          >
            {sortedWeekKeys.map((key, index) => (
              <option key={key} value={key.toString()}>
                {index === 0 ? `ล่าสุด (วันที่ ${weeksMap.get(key)})` : `วันที่ ${weeksMap.get(key)}`}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
            <ChevronDown size={20} />
          </div>
        </div>
      </div>
      <div className="space-y-12">
        {displayDates.map((date) => (
          <section key={date} className="relative">
            <div className="sticky top-20 z-40 mb-6 flex items-center">
              <span className="bg-white border border-gray-200 shadow-sm px-5 py-2.5 rounded-full text-sm font-black text-gray-800 flex items-center">
                <Calendar size={18} className="mr-2 text-blue-600" />
                {date}
              </span>
              <div className="h-px bg-gradient-to-r from-gray-200 to-transparent flex-grow ml-4"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {groupedNews[date].map((item) => (
                <NewsCard key={item.id} item={item} onEdit={() => onEdit(item)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ส่วนแสดงผลกล่องข่าว (NewsCard)
function NewsCard({ item, onEdit }) {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const imageSource = item.imageUrl || item.imageBase64;

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const markTextAsCopied = async () => {
    if (item.textCopied) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id), { textCopied: true }); } catch (err) {}
  };

  const markImageAsCopied = async () => {
    if (item.imageCopied) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id), { imageCopied: true }); } catch (err) {}
  };

  const resetStatus = async () => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id), { textCopied: false, imageCopied: false, copied: false }); } catch (err) {}
  };

  const handleDelete = async () => {
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id)); } catch (err) { showToast('ไม่สามารถลบข่าวได้'); }
  };

  const isFullyUsed = item.copied || (imageSource ? (item.textCopied && item.imageCopied) : item.textCopied);

  const handleCopyText = () => {
    const textArea = document.createElement("textarea");
    textArea.value = item.content;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      if (document.execCommand("copy")) {
        setCopiedText(true);
        markTextAsCopied();
        setTimeout(() => setCopiedText(false), 2000);
      }
    } catch (err) { showToast('ไม่สามารถคัดลอกได้อัตโนมัติ'); }
    document.body.removeChild(textArea);
  };

  const handleCopyImage = async () => {
    if (!imageSource) return;
    try {
      const response = await fetch(imageSource);
      const blob = await response.blob();
      let clipboardItemData = blob;
      if (blob.type !== 'image/png') {
         const bitmap = await createImageBitmap(blob);
         const canvas = document.createElement('canvas');
         canvas.width = bitmap.width; canvas.height = bitmap.height;
         const ctx = canvas.getContext('2d');
         ctx.drawImage(bitmap, 0, 0);
         clipboardItemData = await new Promise(res => canvas.toBlob(res, 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': clipboardItemData })]);
      setCopiedImg(true); markImageAsCopied();
      setTimeout(() => setCopiedImg(false), 2000);
    } catch (err) { showToast('เบราว์เซอร์ไม่อนุญาตให้ก๊อปปี้รูปโดยตรง กรุณาใช้ปุ่ม "ดาวน์โหลด" แทนครับ'); }
  };

  const handleDownloadImage = () => {
    if (!imageSource) return;
    if (item.imageUrl) { window.open(imageSource, '_blank'); } 
    else {
      const a = document.createElement('a'); a.href = imageSource; a.download = `news_${item.id}.jpg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    markImageAsCopied();
  };

  const maxLength = 180;
  const isLongText = item.content && item.content.length > maxLength;
  const displayContent = (!isLongText || isExpanded) ? item.content : item.content.slice(0, maxLength) + '...';

  const renderTextWithLinks = (text) => {
    if (!text) return text;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => part.match(urlRegex) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-medium">{part}</a>
    ) : part);
  };

  return (
    <div className={`rounded-3xl shadow-sm border overflow-hidden transition-all duration-500 flex flex-col relative ${isFullyUsed ? 'bg-green-50/50 border-green-200 ring-2 ring-green-100 opacity-90 scale-[0.98]' : 'bg-white border-gray-100 hover:shadow-xl hover:-translate-y-1'}`}>
      <div className="absolute top-4 right-4 z-20 flex space-x-2 bg-white/90 backdrop-blur-md rounded-2xl p-1.5 shadow-sm border border-gray-100">
         <button onClick={onEdit} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"><Edit2 size={16} /></button>
         {showConfirmDelete ? (
           <button onClick={handleDelete} className="px-3 py-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition">ลบเลย</button>
         ) : (
           <button onClick={() => setShowConfirmDelete(true)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition"><Trash2 size={16} /></button>
         )}
      </div>
      {toastMsg && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 bg-gray-900/90 text-white text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center w-[85%] justify-center animate-bounce border border-white/20">
           <Info size={14} className="mr-2 flex-shrink-0 text-blue-400" /> <span className="text-center font-medium">{toastMsg}</span>
        </div>
      )}
      {imageSource && (
        <div className={`relative overflow-hidden group aspect-video flex items-center justify-center ${isFullyUsed ? 'bg-green-100/20' : 'bg-gray-50'}`}>
          <img src={imageSource} alt="News" className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/40 transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-4">
             <button onClick={handleCopyImage} className="bg-white text-gray-900 p-3 rounded-2xl hover:bg-blue-50 transition transform hover:scale-110 shadow-lg"><Copy size={24} /></button>
             <button onClick={handleDownloadImage} className="bg-white text-gray-900 p-3 rounded-2xl hover:bg-blue-50 transition transform hover:scale-110 shadow-lg"><Download size={24} /></button>
          </div>
        </div>
      )}
      <div className="p-6 flex-grow flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-1 rounded-md">
            <Clock size={12} className="mr-1" /> {item.timeString}
          </div>
          {isFullyUsed && (
            <div className="flex items-center space-x-2">
              <span className="bg-green-600 text-white text-[10px] px-2.5 py-1 rounded-full flex items-center font-black uppercase tracking-wider shadow-sm shadow-green-200">
                <Check size={10} className="mr-1 stroke-[4]" /> นำไปใช้แล้ว
              </span>
              <button onClick={resetStatus} className="text-gray-300 hover:text-blue-600 transition p-1 bg-white rounded-lg border border-gray-100 shadow-sm"><RotateCcw size={12} /></button>
            </div>
          )}
        </div>
        <div className="text-gray-700 whitespace-pre-wrap flex-grow leading-relaxed font-medium">
          {renderTextWithLinks(displayContent)}
          {isLongText && (
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-blue-600 hover:text-blue-800 font-bold ml-2 transition underline decoration-2 underline-offset-4">
              {isExpanded ? 'ย่อเนื้อหา' : 'อ่านต่อ'}
            </button>
          )}
        </div>
        <div className="mt-6 pt-5 border-t border-gray-100">
           <button onClick={handleCopyText} className={`w-full flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-bold transition shadow-sm ${copiedText ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg active:scale-95'}`}>
             {copiedText ? <><Check size={18} className="mr-2" /> คัดลอกข้อความสำเร็จ</> : <><Copy size={18} className="mr-2" /> คัดลอกข้อความไปใช้</>}
           </button>
        </div>
      </div>
    </div>
  );
}

// ส่วนจัดการหลังบ้าน (AdminPanel)
function AdminPanel({ setView, editingItem }) {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [day, setDay] = useState(() => new Date().getDate());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [yearBE, setYearBE] = useState(() => new Date().getFullYear() + 543);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (editingItem) {
      setContent(editingItem.content);
      const d = new Date(editingItem.timestamp);
      setDay(d.getDate());
      setMonth(d.getMonth());
      setYearBE(d.getFullYear() + 543);
      setImagePreview(editingItem.imageBase64 || editingItem.imageUrl);
    }
  }, [editingItem]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !imagePreview) return;
    setIsSubmitting(true);
    try {
      let base64Image = editingItem?.imageBase64 || null;
      if (imageFile) base64Image = await processImage(imageFile, 700);

      const now = new Date();
      const chosenDate = new Date(yearBE - 543, month, day);
      if (editingItem) {
        const oldDate = new Date(editingItem.timestamp);
        chosenDate.setHours(oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
      } else {
        chosenDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      }

      const optionsDate = { year: 'numeric', month: 'long', day: 'numeric' };
      const optionsTime = { hour: '2-digit', minute: '2-digit' };
      
      const payload = {
        timestamp: chosenDate.getTime(),
        dateString: chosenDate.toLocaleDateString('th-TH', optionsDate),
        timeString: chosenDate.toLocaleTimeString('th-TH', optionsTime),
        content: content || "",
        imageBase64: base64Image || null,
        textCopied: editingItem?.textCopied ?? false,
        imageCopied: editingItem?.imageCopied ?? false,
        copied: editingItem?.copied ?? false
      };

      if (editingItem) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', editingItem.id), payload);
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', crypto.randomUUID()), payload);
      }
      setView();
    } catch (error) { alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล"); } finally { setIsSubmitting(false); }
  };

  const currentBE = new Date().getFullYear() + 543;
  const years = Array.from({ length: 5 }, (_, i) => currentBE - 2 + i);

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-[2.5rem] shadow-xl border border-gray-100 p-8 md:p-12">
      <div className="flex items-center mb-10">
        <div className={`p-3 rounded-2xl mr-4 shadow-sm ${editingItem ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
          {editingItem ? <Edit2 size={32} /> : <Plus size={32} />}
        </div>
        <div>
          <h2 className="text-3xl font-black text-gray-800 tracking-tight">{editingItem ? 'แก้ไขข่าวเก่า' : 'ลงข่าวใหม่'}</h2>
          <p className="text-gray-400 font-medium">ระบุวันที่และเนื้อหาเพื่อโพสต์ลงระบบ</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div>
          <label className="block text-sm font-black text-gray-700 mb-3 uppercase tracking-wider">วันที่ระบุในข่าว (วัน / เดือน / ปี พ.ศ.)</label>
          <div className="grid grid-cols-3 gap-4">
            <select value={day} onChange={(e) => setDay(parseInt(e.target.value))} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-center">
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i+1} value={i+1}>{i+1}</option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 font-bold">
              {THAI_MONTHS.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select value={yearBE} onChange={(e) => setYearBE(parseInt(e.target.value))} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:outline-none focus:ring-4 focus:ring-blue-500/10 font-bold text-center">
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-black text-gray-700 mb-3 uppercase tracking-wider">รูปภาพข่าว</label>
          <div className={`mt-1 flex justify-center px-8 pt-8 pb-10 border-4 border-dashed rounded-[2rem] transition-all cursor-pointer relative overflow-hidden ${imagePreview ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`} onClick={() => fileInputRef.current.click()}>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="sr-only" />
            {imagePreview ? (
              <div className="relative w-full text-center">
                <img src={imagePreview} alt="Preview" className="max-h-72 mx-auto rounded-3xl object-contain shadow-lg" />
                <div className="mt-4 inline-flex items-center text-sm text-blue-600 font-black bg-white px-4 py-2 rounded-full shadow-sm border border-blue-100">
                  <RotateCcw size={14} className="mr-2" /> เปลี่ยนรูปภาพใหม่
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-center py-6">
                <div className="bg-white w-16 h-16 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-center mx-auto text-gray-300">
                  <ImageIcon size={32} />
                </div>
                <div><span className="text-lg font-black text-blue-600">คลิกเพื่ออัปโหลด</span></div>
                <p className="text-sm text-gray-400 font-medium">รองรับ JPG, PNG (ระบบจะบีบอัดอัตโนมัติหากไฟล์ใหญ่เกินไป)</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-black text-gray-700 mb-3 uppercase tracking-wider">เนื้อหาและข้อความข่าว</label>
          <textarea rows={8} className="shadow-sm block w-full bg-gray-50 border border-gray-200 rounded-[2rem] p-6 focus:outline-none focus:ring-4 focus:ring-blue-500/10 font-medium placeholder:text-gray-300 transition-all" placeholder="วางลิงก์ข่าวหรือพิมพ์เนื้อหาที่นี่..." value={content} onChange={(e) => setContent(e.target.value)} required />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <button type="button" onClick={setView} className="w-full sm:w-1/3 px-8 py-4 border-2 border-gray-200 rounded-2xl text-gray-500 font-black hover:bg-gray-50 transition active:scale-95 uppercase tracking-widest text-xs">ยกเลิก</button>
          <button type="submit" disabled={isSubmitting || (!content && !imagePreview)} className={`w-full sm:w-2/3 px-8 py-4 rounded-2xl shadow-xl text-white font-black transition active:scale-95 uppercase tracking-widest text-xs ${isSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
            {isSubmitting ? 'กำลังบันทึกข้อมูล...' : (editingItem ? 'บันทึกการแก้ไข' : 'เผยแพร่ข่าวทันที')}
          </button>
        </div>
      </form>
    </div>
  );
}