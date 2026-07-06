// Consolidated Demo & Mock Datasets for Duo Couple E2EE Space

export const DEMO_PARTNER_A = {
  id: 'A',
  name: 'Mạnh',
  avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop'
};

export const DEMO_PARTNER_B = {
  id: 'B',
  name: 'Linh',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop'
};

export const DEMO_MESSAGES = [
  {
    id: 'seed-1',
    senderId: 'B',
    ciphertext: 'ENC[Q2jDoG8gYW5oIHnDqnUhIENow7pjIGFuaCBt4buZdCBuZ8OgeSBuZ+G7jXQgbmfDoG8g8J+MuA==]', // Chào anh yêu! Chúc anh một ngày ngọt ngào 🌸
    iv: 'fallback-iv',
    timestamp: Date.now() - 3600000 * 2,
    type: 'text'
  },
  {
    id: 'seed-2',
    senderId: 'A',
    ciphertext: 'ENC[Q2jDoG8gZW0gecOqdSEgQW5oIGPFqW5nIGNow7pjIGVtIG5nw6B5IG3hu5tpIHRo4bqtdCBuaGnhu4F1IG5p4buDbSB2dWku]', // Chào em yêu! Anh cũng chúc em ngày mới thật nhiều niềm vui.
    iv: 'fallback-iv',
    timestamp: Date.now() - 3600000,
    type: 'text'
  }
];

export const DEMO_REMINDERS = [
  {
    id: 'rem-1',
    title: 'Mua hoa hồng tặng Linh dịp cuối tuần 🌹',
    category: 'gift',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    completed: false,
    createdBy: 'A',
    timestamp: Date.now()
  },
  {
    id: 'rem-2',
    title: 'Hẹn hò tối thứ Sáu tại nhà hàng Rooftop 🕯️',
    category: 'date',
    dueDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
    completed: false,
    createdBy: 'B',
    timestamp: Date.now()
  }
];

export const DEMO_ANNIVERSARIES = [
  {
    id: 'anniv-seed-1',
    title: 'Lần đầu tiên gặp nhau ở quán cà phê xưa ☕',
    date: '2025-05-10',
    notes: 'Hôm đó trời đổ mưa ngâu. Anh lóng ngóng làm đổ cả trà sữa lên áo, còn em thì bật cười khúc khích. Đó là khoảnh khắc anh biết mình đã yêu.',
    photo: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&auto=format&fit=crop',
    createdBy: 'A',
    timestamp: Date.now() - 86400000 * 40
  },
  {
    id: 'anniv-seed-2',
    title: 'Chuyến du lịch Sa Pa ngắm tuyết rơi ❄️',
    date: '2025-12-24',
    notes: 'Sa Pa lạnh buốt, nhưng bàn tay em trong túi áo anh thì vô cùng ấm áp. Chúng ta đã cùng nguyện ước dưới chân đỉnh Fansipan.',
    photo: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?w=600&auto=format&fit=crop',
    createdBy: 'B',
    timestamp: Date.now() - 86400000 * 10
  }
];

export const ROMANTIC_PRESETS = [
  { id: 'p1', name: 'Bình minh trên bãi biển Nha Trang', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop' },
  { id: 'p2', name: 'Đà Lạt sương mù cùng anh', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&auto=format&fit=crop' },
  { id: 'p3', name: 'Cà phê chiều thu Hà Nội', url: 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600&auto=format&fit=crop' },
  { id: 'p4', name: 'Ngắm hoàng hôn Phú Quốc', url: 'https://images.unsplash.com/photo-1472214222541-d510753a4707?w=600&auto=format&fit=crop' }
];

// Default seed database with pre-populated demo content
export const DEFAULT_STATE = {
  pairingCode: 'DUO-2026-LOVE',
  anniversaryDate: '2025-10-15',
  partnerA: DEMO_PARTNER_A,
  partnerB: DEMO_PARTNER_B,
  messages: DEMO_MESSAGES,
  photos: [],
  reminders: DEMO_REMINDERS,
  specialAnniversaries: DEMO_ANNIVERSARIES,
  waterLogs: [],
  passcodeHashA: '',
  passcodeHashB: '',
  storageMethodA: 'p2p',
  storageMethodB: 'p2p'
};

// Pure database state from scratch with no pre-filled demo messages, timers or diaries
export const CLEAN_STATE = {
  pairingCode: 'DUO-2026-LOVE',
  anniversaryDate: new Date().toISOString().split('T')[0], // Reset to current day
  partnerA: {
    id: 'A',
    name: 'Người thương A',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop'
  },
  partnerB: {
    id: 'B',
    name: 'Người thương B',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop'
  },
  messages: [],
  photos: [],
  reminders: [],
  specialAnniversaries: [],
  waterLogs: [],
  passcodeHashA: '',
  passcodeHashB: '',
  storageMethodA: 'p2p',
  storageMethodB: 'p2p'
};
