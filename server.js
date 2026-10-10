/**
 * Backend Server - Vietjet Air
 * Hỗ trợ:
 * 1. Open-Meteo Weather API (Thời tiết hiện tại)
 * 2. OpenWeatherMap API (Dự báo thời tiết 5 ngày tới theo tên thành phố)
 * Đọc API Key từ file .env (OPENWEATHER_API_KEY)
 * Sử dụng thư viện gốc của Node.js (http, fs, path, fetch) - Không cần thư viện phụ thuộc.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const TIMEOUT_MS = 5000; // Thời gian chờ tối đa cho API bên thứ ba (5 giây)

/**
 * Đọc biến môi trường từ file .env một cách an toàn
 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {
      console.warn('Không thể đọc file .env:', e.message);
    }
  }
}

// Khởi chạy nạp .env
loadEnv();

/**
 * Lấy OpenWeatherMap API Key từ .env (tự động đọc lại file để bắt thay đổi mới nhất)
 */
function getOpenWeatherApiKey() {
  loadEnv();
  return (process.env.OPENWEATHER_API_KEY || '').trim();
}

// Bảng ánh xạ mã thời tiết OpenWeatherMap icon sang tiếng Việt & Bootstrap Icons
const OWM_ICON_MAP = {
  '01d': { icon: 'bi-sun-fill', desc: 'Trời quang nắng' },
  '01n': { icon: 'bi-moon-stars-fill', desc: 'Trời quang đêm' },
  '02d': { icon: 'bi-cloud-sun-fill', desc: 'Ít mây' },
  '02n': { icon: 'bi-cloud-moon-fill', desc: 'Ít mây' },
  '03d': { icon: 'bi-cloud-fill', desc: 'Mây rải rác' },
  '03n': { icon: 'bi-cloud-fill', desc: 'Mây rải rác' },
  '04d': { icon: 'bi-clouds-fill', desc: 'Nhiều mây' },
  '04n': { icon: 'bi-clouds-fill', desc: 'Nhiều mây' },
  '09d': { icon: 'bi-cloud-drizzle-fill', desc: 'Mưa rào' },
  '09n': { icon: 'bi-cloud-drizzle-fill', desc: 'Mưa rào' },
  '10d': { icon: 'bi-cloud-rain-fill', desc: 'Có mưa' },
  '10n': { icon: 'bi-cloud-rain-fill', desc: 'Có mưa' },
  '11d': { icon: 'bi-cloud-lightning-fill', desc: 'Dông bão' },
  '11n': { icon: 'bi-cloud-lightning-fill', desc: 'Dông bão' },
  '13d': { icon: 'bi-cloud-snow-fill', desc: 'Có tuyết rơi' },
  '13n': { icon: 'bi-cloud-snow-fill', desc: 'Có tuyết rơi' },
  '50d': { icon: 'bi-cloud-fog2-fill', desc: 'Có sương mù' },
  '50n': { icon: 'bi-cloud-fog2-fill', desc: 'Có sương mù' },
};

// Bảng ánh xạ mã thời tiết WMO (WMO Weather Code)
const WMO_WEATHER_MAP = {
  0: { desc: 'Trời quang đãng, nắng đẹp', icon: 'bi-sun-fill', iconNight: 'bi-moon-stars-fill' },
  1: { desc: 'Chủ yếu quang đãng, ít mây', icon: 'bi-cloud-sun-fill', iconNight: 'bi-cloud-moon-fill' },
  2: { desc: 'Mây rải rác', icon: 'bi-cloud-sun-fill', iconNight: 'bi-cloud-moon-fill' },
  3: { desc: 'Trời nhiều mây, âm u', icon: 'bi-clouds-fill', iconNight: 'bi-clouds-fill' },
  45: { desc: 'Có sương mù', icon: 'bi-cloud-fog2-fill', iconNight: 'bi-cloud-fog2-fill' },
  48: { desc: 'Sương mù đọng băng', icon: 'bi-cloud-fog2-fill', iconNight: 'bi-cloud-fog2-fill' },
  51: { desc: 'Mưa phùn nhẹ', icon: 'bi-cloud-drizzle-fill', iconNight: 'bi-cloud-drizzle-fill' },
  53: { desc: 'Mưa phùn vừa', icon: 'bi-cloud-drizzle-fill', iconNight: 'bi-cloud-drizzle-fill' },
  55: { desc: 'Mưa phùn dày hạt', icon: 'bi-cloud-drizzle-fill', iconNight: 'bi-cloud-drizzle-fill' },
  56: { desc: 'Mưa phùn lạnh buốt', icon: 'bi-cloud-sleet-fill', iconNight: 'bi-cloud-sleet-fill' },
  57: { desc: 'Mưa phùn băng giá mạnh', icon: 'bi-cloud-sleet-fill', iconNight: 'bi-cloud-sleet-fill' },
  61: { desc: 'Mưa nhỏ rải rác', icon: 'bi-cloud-rain', iconNight: 'bi-cloud-rain' },
  63: { desc: 'Mưa vừa', icon: 'bi-cloud-rain-fill', iconNight: 'bi-cloud-rain-fill' },
  65: { desc: 'Mưa to diện rộng', icon: 'bi-cloud-rain-heavy-fill', iconNight: 'bi-cloud-rain-heavy-fill' },
  66: { desc: 'Mưa băng nhẹ', icon: 'bi-cloud-sleet', iconNight: 'bi-cloud-sleet' },
  67: { desc: 'Mưa băng dữ dội', icon: 'bi-cloud-sleet-fill', iconNight: 'bi-cloud-sleet-fill' },
  71: { desc: 'Tuyết rơi nhẹ', icon: 'bi-cloud-snow', iconNight: 'bi-cloud-snow' },
  73: { desc: 'Tuyết rơi vừa', icon: 'bi-cloud-snow-fill', iconNight: 'bi-cloud-snow-fill' },
  75: { desc: 'Tuyết rơi dày', icon: 'bi-snow', iconNight: 'bi-snow' },
  77: { desc: 'Tuyết hạt', icon: 'bi-snow', iconNight: 'bi-snow' },
  80: { desc: 'Mưa rào nhẹ', icon: 'bi-cloud-rain', iconNight: 'bi-cloud-rain' },
  81: { desc: 'Mưa rào từng đợt', icon: 'bi-cloud-rain-fill', iconNight: 'bi-cloud-rain-fill' },
  82: { desc: 'Mưa rào xối xả', icon: 'bi-cloud-rain-heavy-fill', iconNight: 'bi-cloud-rain-heavy-fill' },
  85: { desc: 'Mưa tuyết rào nhẹ', icon: 'bi-cloud-snow', iconNight: 'bi-cloud-snow' },
  86: { desc: 'Mưa tuyết rào nặng hạt', icon: 'bi-cloud-snow-fill', iconNight: 'bi-cloud-snow-fill' },
  95: { desc: 'Dông bão, có sấm sét', icon: 'bi-cloud-lightning-fill', iconNight: 'bi-cloud-lightning-fill' },
  96: { desc: 'Dông bão kèm mưa đá nhẹ', icon: 'bi-cloud-lightning-rain-fill', iconNight: 'bi-cloud-lightning-rain-fill' },
  99: { desc: 'Dông bão kèm mưa đá dữ dội', icon: 'bi-cloud-lightning-rain-fill', iconNight: 'bi-cloud-lightning-rain-fill' },
};

// Hàm định danh MIME type cho static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Fetch kèm timeout để xử lý trường hợp API bên thứ ba phản hồi chậm
 */
async function fetchWithTimeout(resource, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Xử lý danh sách 40 mốc dự báo từ OpenWeatherMap thành danh sách 5 ngày cô đọng
 */
function process5DayForecast(list) {
  const daysMap = new Map();
  const vietnameseDays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  // Nhóm các điểm dự báo theo ngày (YYYY-MM-DD)
  list.forEach(item => {
    if (!item.dt_txt) return;
    const datePart = item.dt_txt.split(' ')[0];
    if (!daysMap.has(datePart)) {
      daysMap.set(datePart, []);
    }
    daysMap.get(datePart).push(item);
  });

  const result = [];
  for (const [dateStr, items] of daysMap.entries()) {
    // Chọn khung giờ gần 12h trưa nhất làm đại diện cho thời tiết ban ngày
    let repItem = items[0];
    let minHourDiff = Infinity;
    items.forEach(it => {
      const hour = parseInt((it.dt_txt.split(' ')[1] || '00').split(':')[0], 10);
      const diff = Math.abs(hour - 12);
      if (diff < minHourDiff) {
        minHourDiff = diff;
        repItem = it;
      }
    });

    const temps = items.map(it => it.main.temp);
    const minTemp = Math.round(Math.min(...temps));
    const maxTemp = Math.round(Math.max(...temps));
    const repTemp = Math.round(repItem.main.temp * 10) / 10;

    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = vietnameseDays[dateObj.getDay()];
    const dayOfMonth = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');

    const weatherObj = (repItem.weather && repItem.weather[0]) || {};
    const iconCode = weatherObj.icon || '01d';
    const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    const bsIcon = (OWM_ICON_MAP[iconCode] && OWM_ICON_MAP[iconCode].icon) || 'bi-cloud-sun-fill';

    let desc = weatherObj.description || 'Thời tiết đẹp';
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    result.push({
      date: dateStr,
      displayDate: `${dayOfMonth}/${month}`,
      dayName: dayName,
      temp: repTemp,
      tempMin: minTemp,
      tempMax: maxTemp,
      description: desc,
      iconCode: iconCode,
      iconUrl: iconUrl,
      bsIcon: bsIcon,
      humidity: repItem.main.humidity,
      windSpeed: Math.round(repItem.wind.speed * 3.6 * 10) / 10, // m/s -> km/h
      pop: Math.round((repItem.pop || 0) * 100), // Xác suất mưa (%)
    });

    if (result.length === 5) break;
  }

  return result;
}

/**
 * Xử lý gọi OpenWeatherMap API: Dự báo thời tiết 5 ngày tới
 */
async function handleOpenWeatherForecastRequest(req, res, searchParams) {
  const cityName = (searchParams.get('city') || '').trim();

  // Kiểm tra tham số tên thành phố
  if (!cityName) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: false,
      error: 'Vui lòng cung cấp tên thành phố (ví dụ: ?city=Hanoi hoặc ?city=Ho Chi Minh)',
    }));
  }

  // Đọc API Key từ .env
  const apiKey = getOpenWeatherApiKey();
  if (!apiKey) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: false,
      code: 'MISSING_API_KEY',
      error: 'Chưa tìm thấy OPENWEATHER_API_KEY trong file .env. Vui lòng mở file .env và điền: OPENWEATHER_API_KEY=your_key_here rồi lưu lại!',
    }));
  }

  try {
    const owmUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cityName)}&appid=${apiKey}&units=metric&lang=vi`;
    const response = await fetchWithTimeout(owmUrl, {}, TIMEOUT_MS);

    // Xử lý không tìm thấy thành phố
    if (response.status === 404) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: false,
        city: cityName,
        code: 'CITY_NOT_FOUND',
        error: `Không tìm thấy thành phố "${cityName}" trên OpenWeatherMap. Vui lòng kiểm tra lại chính tả (ví dụ: Hanoi, Ho Chi Minh, Da Nang, Bangkok, Tokyo).`,
      }));
    }

    // Xử lý API Key không hợp lệ hoặc chưa kích hoạt
    if (response.status === 401) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: false,
        code: 'INVALID_API_KEY',
        error: 'API Key OpenWeatherMap không hợp lệ hoặc tài khoản vừa đăng ký chưa được kích hoạt (OpenWeatherMap thường cần 10-60 phút để kích hoạt tài khoản mới).',
      }));
    }

    if (!response.ok) {
      throw new Error(`OpenWeatherMap trả về mã lỗi HTTP: ${response.status}`);
    }

    const data = await response.json();
    const forecastDays = process5DayForecast(data.list || []);

    const responsePayload = {
      success: true,
      source: 'OpenWeatherMap',
      city: data.city ? data.city.name : cityName,
      country: data.city ? data.city.country : '',
      coordinates: data.city ? data.city.coord : null,
      forecast: forecastDays,
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600', // Cache 10 phút
    });
    return res.end(JSON.stringify(responsePayload));

  } catch (error) {
    console.error(`[OpenWeatherMap Forecast Error - ${cityName}]:`, error.message);

    // Xử lý API phản hồi chậm (Timeout)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: false,
        city: cityName,
        code: 'TIMEOUT',
        error: 'API OpenWeatherMap phản hồi quá chậm (quá thời gian chờ 5 giây). Vui lòng thử lại sau!',
      }));
    }

    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: false,
      city: cityName,
      code: 'API_ERROR',
      error: 'Không thể kết nối đến máy chủ thời tiết OpenWeatherMap. Vui lòng kiểm tra kết nối mạng của bạn.',
      detail: error.message,
    }));
  }
}

/**
 * Xử lý logic gọi API thời tiết hiện tại từ Open-Meteo
 */
async function handleWeatherRequest(req, res, searchParams) {
  const cityName = (searchParams.get('city') || '').trim();

  // Kiểm tra tham số đầu vào
  if (!cityName) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: false,
      error: 'Vui lòng cung cấp tên thành phố (ví dụ: ?city=Hanoi hoặc ?city=Ho Chi Minh)',
    }));
  }

  try {
    // BƯỚC 1: Geocoding API để tìm tọa độ kinh độ & vĩ độ của thành phố
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=vi&format=json`;
    const geoRes = await fetchWithTimeout(geoUrl, {}, TIMEOUT_MS);

    if (!geoRes.ok) {
      throw new Error(`Geocoding API trả về mã lỗi: ${geoRes.status}`);
    }

    const geoData = await geoRes.json();

    // Xử lý trường hợp KHÔNG tìm thấy thành phố
    if (!geoData.results || geoData.results.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: false,
        city: cityName,
        error: `Không tìm thấy thông tin cho thành phố "${cityName}". Vui lòng kiểm tra lại chính tả hoặc thử tên tiếng Anh (ví dụ: Hanoi, Da Nang, Bangkok, Tokyo).`,
      }));
    }

    const location = geoData.results[0];
    const { latitude, longitude, name: resolvedName, country, admin1 } = location;

    // BƯỚC 2: Gọi Weather Forecast API từ Open-Meteo với tọa độ vừa tìm được
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto`;
    const weatherRes = await fetchWithTimeout(weatherUrl, {}, TIMEOUT_MS);

    if (!weatherRes.ok) {
      throw new Error(`Weather API trả về mã lỗi: ${weatherRes.status}`);
    }

    const weatherData = await weatherRes.json();
    const current = weatherData.current;

    if (!current) {
      throw new Error('Dữ liệu thời tiết hiện tại không khả dụng');
    }

    // Ánh xạ mã WMO sang mô tả tiếng Việt và icon
    const weatherInfo = WMO_WEATHER_MAP[current.weather_code] || {
      desc: 'Thời tiết đặc trưng',
      icon: 'bi-cloud-sun',
      iconNight: 'bi-cloud-moon',
    };

    const isDay = current.is_day === 1;
    const selectedIcon = isDay ? weatherInfo.icon : weatherInfo.iconNight;

    // Chuẩn hóa dữ liệu trả về cho Frontend
    const responsePayload = {
      success: true,
      city: resolvedName,
      country: country || '',
      adminArea: admin1 || '',
      coordinates: {
        latitude,
        longitude,
      },
      weather: {
        temperature: Math.round(current.temperature_2m * 10) / 10,
        temperatureUnit: '°C',
        apparentTemperature: Math.round(current.apparent_temperature * 10) / 10,
        humidity: current.relative_humidity_2m,
        humidityUnit: '%',
        windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
        windSpeedUnit: 'km/h',
        weatherCode: current.weather_code,
        description: weatherInfo.desc,
        isDay: isDay,
        icon: selectedIcon,
        time: current.time,
      },
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300', // Cache 5 phút
    });
    return res.end(JSON.stringify(responsePayload));

  } catch (error) {
    console.error(`[Weather Error - ${cityName}]:`, error.message);

    // Xử lý trường hợp API phản hồi chậm (Timeout)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: false,
        city: cityName,
        code: 'TIMEOUT',
        error: 'API thời tiết Open-Meteo phản hồi quá chậm (quá thời gian chờ 5 giây). Vui lòng thử lại sau!',
      }));
    }

    // Các lỗi mạng hoặc dịch vụ khác
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: false,
      city: cityName,
      code: 'API_ERROR',
      error: 'Không thể kết nối đến máy chủ thời tiết Open-Meteo. Vui lòng kiểm tra kết nối mạng của bạn.',
      detail: error.message,
    }));
  }
}

/**
 * Phục vụ static files (HTML, CSS, JS, hình ảnh)
 */
function serveStaticFile(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found - Trang hoặc tệp tin không tồn tại');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Khởi tạo máy chủ HTTP
const server = http.createServer(async (req, res) => {
  // Kích hoạt CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Routing 1: Dự báo thời tiết 5 ngày tới từ OpenWeatherMap
    if (pathname === '/api/weather/forecast') {
      return await handleOpenWeatherForecastRequest(req, res, parsedUrl.searchParams);
    }

    // Routing 2: Thời tiết hiện tại từ Open-Meteo
    if (pathname === '/api/weather') {
      return await handleWeatherRequest(req, res, parsedUrl.searchParams);
    }

    // Routing 3: Phục vụ static files
    return serveStaticFile(req, res, pathname);
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

// Khởi động server với tính năng tự động chuyển cổng nếu cổng 3000 bị chiếm dụng
let currentPort = Number(PORT);

server.on('listening', () => {
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : currentPort;
  const hasOwmKey = Boolean(getOpenWeatherApiKey());
  console.log(`\n======================================================`);
  console.log(`🚀 Vietjet Air Weather Server đang chạy tại:`);
  console.log(`👉 http://localhost:${actualPort}`);
  console.log(`🌤️ Current Weather: http://localhost:${actualPort}/api/weather?city=Hanoi`);
  console.log(`📅 5-Day Forecast:  http://localhost:${actualPort}/api/weather/forecast?city=Hanoi`);
  console.log(`🔑 OpenWeatherMap API Key trong .env: ${hasOwmKey ? 'Đã tìm thấy (OK)' : 'Chưa có hoặc đang trống'}`);
  console.log(`======================================================\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️ Cổng ${currentPort} đang bận, đang chuyển sang cổng ${currentPort + 1}...`);
    currentPort += 1;
    setTimeout(() => server.listen(currentPort), 200);
  } else {
    console.error('Lỗi khởi động server:', err);
  }
});

server.listen(currentPort);
