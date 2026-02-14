const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'work-manager-secret-key-2024';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Plik bazy danych
const DB_FILE = path.join(__dirname, 'database.json');

// Inicjalizacja bazy danych
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            uzytkownicy: [
                { id: '1', login: 'brygadzista', haslo: bcrypt.hashSync('brygadzista123', 10), rola: 'brygadzista', nazwa: 'Brygadzista' },
                { id: '2', login: 'ksiegowa', haslo: bcrypt.hashSync('ksiegowa123', 10), rola: 'ksiegowa', nazwa: 'Księgowa' }
            ],
            pracownicy: [],
            wpisy: [],
            zatwierdzenia: {}
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

// Odczyt bazy danych
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { uzytkownicy: [], pracownicy: [], wpisy: [], zatwierdzenia: {} };
    }
}

// Zapis bazy danych
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Middleware autoryzacji
function autoryzacja(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.uzytkownik = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Nieprawidłowy token' });
    }
}

initDB();

// === API LOGOWANIA ===

app.post('/api/login', (req, res) => {
    const { login, haslo } = req.body;
    const db = readDB();
    
    const uzytkownik = db.uzytkownicy.find(u => u.login === login);
    if (!uzytkownik || !bcrypt.compareSync(haslo, uzytkownik.haslo)) {
        return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
    }
    
    const token = jwt.sign(
        { id: uzytkownik.id, login: uzytkownik.login, rola: uzytkownik.rola, nazwa: uzytkownik.nazwa },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    
    res.json({ 
        token, 
        uzytkownik: { 
            id: uzytkownik.id, 
            login: uzytkownik.login, 
            rola: uzytkownik.rola, 
            nazwa: uzytkownik.nazwa 
        } 
    });
});

// === API PRACOWNIKÓW ===

// Pobierz wszystkich pracowników (tylko brygadzista i ksiegowa)
app.get('/api/pracownicy', autoryzacja, (req, res) => {
    const db = readDB();
    res.json(db.pracownicy);
});

// Dodaj pracownika (tylko brygadzista)
app.post('/api/pracownicy', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'brygadzista') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const pracownik = {
        id: Date.now().toString(),
        imie: req.body.imie,
        nazwisko: req.body.nazwisko,
        stanowisko: req.body.stanowisko || 'Pracownik',
        stawka: parseFloat(req.body.stawka) || 25,
        data_dodania: new Date().toISOString()
    };
    db.pracownicy.push(pracownik);
    saveDB(db);
    res.json(pracownik);
});

// Usuń pracownika (tylko brygadzista)
app.delete('/api/pracownicy/:id', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'brygadzista') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    db.pracownicy = db.pracownicy.filter(p => p.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// Aktualizuj stawkę pracownika (tylko ksiegowa)
app.put('/api/pracownicy/:id/stawka', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'ksiegowa') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const pracownik = db.pracownicy.find(p => p.id === req.params.id);
    if (!pracownik) {
        return res.status(404).json({ error: 'Pracownik nie znaleziony' });
    }
    
    pracownik.stawka = parseFloat(req.body.stawka) || 25;
    saveDB(db);
    res.json(pracownik);
});

// === API WPISÓW CZASU PRACY ===

// Pobierz wpisy dla miesiąca
app.get('/api/wpisy/:rok/:miesiac', autoryzacja, (req, res) => {
    const db = readDB();
    const rok = parseInt(req.params.rok);
    const miesiac = parseInt(req.params.miesiac);
    
    const wpisy = db.wpisy.filter(w => {
        const data = new Date(w.data);
        return data.getFullYear() === rok && data.getMonth() === miesiac;
    });
    
    res.json(wpisy);
});

// Dodaj wpis (tylko brygadzista)
app.post('/api/wpisy', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'brygadzista') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const wpis = {
        id: Date.now().toString(),
        pracownikId: req.body.pracownikId,
        data: req.body.data,
        godziny: parseFloat(req.body.godziny),
        notatka: req.body.notatka || '',
        kto_dodal: req.uzytkownik.nazwa,
        data_dodania: new Date().toISOString()
    };
    db.wpisy.push(wpis);
    saveDB(db);
    res.json(wpis);
});

// Aktualizuj wpis (tylko brygadzista)
app.put('/api/wpisy/:id', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'brygadzista') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const wpisIndex = db.wpisy.findIndex(w => w.id === req.params.id);
    if (wpisIndex === -1) {
        return res.status(404).json({ error: 'Wpis nie znaleziony' });
    }
    
    db.wpisy[wpisIndex] = {
        ...db.wpisy[wpisIndex],
        godziny: parseFloat(req.body.godziny) || db.wpisy[wpisIndex].godziny,
        notatka: req.body.notatka !== undefined ? req.body.notatka : db.wpisy[wpisIndex].notatka,
        data_modyfikacji: new Date().toISOString()
    };
    saveDB(db);
    res.json(db.wpisy[wpisIndex]);
});

// Usuń wpis (tylko brygadzista)
app.delete('/api/wpisy/:id', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'brygadzista') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    db.wpisy = db.wpisy.filter(w => w.id !== req.params.id);
    saveDB(db);
    res.json({ success: true });
});

// === API ZATWIERDZEŃ MIESIĄCA ===

// Pobierz status zatwierdzenia
app.get('/api/zatwierdzenie/:rok/:miesiac', autoryzacja, (req, res) => {
    const db = readDB();
    const klucz = `${req.params.rok}-${req.params.miesiac}`;
    res.json(db.zatwierdzenia[klucz] || { zatwierdzony: false });
});

// Zatwierdź miesiąc (tylko ksiegowa)
app.post('/api/zatwierdzenie/:rok/:miesiac', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'ksiegowa') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const klucz = `${req.params.rok}-${req.params.miesiac}`;
    db.zatwierdzenia[klucz] = {
        zatwierdzony: true,
        kto: req.uzytkownik.nazwa,
        data: new Date().toISOString()
    };
    saveDB(db);
    res.json(db.zatwierdzenia[klucz]);
});

// Cofnij zatwierdzenie (tylko ksiegowa)
app.delete('/api/zatwierdzenie/:rok/:miesiac', autoryzacja, (req, res) => {
    if (req.uzytkownik.rola !== 'ksiegowa') {
        return res.status(403).json({ error: 'Brak uprawnień' });
    }
    
    const db = readDB();
    const klucz = `${req.params.rok}-${req.params.miesiac}`;
    delete db.zatwierdzenia[klucz];
    saveDB(db);
    res.json({ success: true });
});

// === API RAPORTÓW I OBLICZEŃ ===

// Generuj raport dla miesiąca
app.get('/api/raport/:rok/:miesiac', autoryzacja, (req, res) => {
    const db = readDB();
    const rok = parseInt(req.params.rok);
    const miesiac = parseInt(req.params.miesiac);
    
    const wpisy = db.wpisy.filter(w => {
        const data = new Date(w.data);
        return data.getFullYear() === rok && data.getMonth() === miesiac;
    });
    
    const result = {};
    db.pracownicy.forEach(p => {
        const pracownikWpis = wpisy.filter(w => w.pracownikId === p.id);
        const sumaGodzin = pracownikWpis.reduce((sum, w) => sum + (w.godziny || 0), 0);
        const brutto = sumaGodzin * (p.stawka || 25);
        const skladki = brutto * 0.18;
        const netto = brutto - skladki;
        
        result[p.id] = {
            id: p.id,
            imie: p.imie,
            nazwisko: p.nazwisko,
            stanowisko: p.stanowisko,
            stawka: p.stawka || 25,
            godziny: sumaGodzin,
            brutto: brutto,
            skladki: skladki,
            netto: netto,
            wpisy: pracownikWpis
        };
    });
    
    const klucz = `${rok}-${miesiac}`;
    const zatwierdzenie = db.zatwierdzenia[klucz] || { zatwierdzony: false };
    
    res.json({
        miesiac: miesiac + 1,
        rok: rok,
        pracownicy: Object.values(result),
        zatwierdzenie: zatwierdzenie,
        suma: {
            godzin: Object.values(result).reduce((sum, p) => sum + p.godziny, 0),
            brutto: Object.values(result).reduce((sum, p) => sum + p.brutto, 0),
            netto: Object.values(result).reduce((sum, p) => sum + p.netto, 0),
            skladki: Object.values(result).reduce((sum, p) => sum + p.skladki, 0)
        }
    });
});

// Eksport CSV
app.get('/api/eksport/csv/:rok/:miesiac', autoryzacja, (req, res) => {
    const db = readDB();
    const rok = parseInt(req.params.rok);
    const miesiac = parseInt(req.params.miesiac);
    
    const wpisy = db.wpisy.filter(w => {
        const data = new Date(w.data);
        return data.getFullYear() === rok && data.getMonth() === miesiac;
    });
    
    let csv = 'Lp,Imie,Nazwisko,Stanowisko,Godziny,Stawka,BRUTTO,NETTO\n';
    
    db.pracownicy.forEach((p, i) => {
        const pracownikWpis = wpisy.filter(w => w.pracownikId === p.id);
        const sumaGodzin = pracownikWpis.reduce((sum, w) => sum + (w.godziny || 0), 0);
        const stawka = p.stawka || 25;
        const brutto = sumaGodzin * stawka;
        const netto = brutto * 0.82;
        
        csv += `${i + 1},${p.imie},${p.nazwisko},${p.stanowisko || 'Pracownik'},${sumaGodzin},${stawka},${brutto.toFixed(2)},${netto.toFixed(2)}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lista_plac_${miesiac + 1}_${rok}.csv"`);
    res.send(csv);
});

// Serwowanie pliku HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     ZUNIFIKOWANY SYSTEM ZARZĄDZANIA PRACĄ - URUCHOMIONY  ║
╠══════════════════════════════════════════════════════════╣
║  Adres: http://localhost:3000                            ║
║                                                          ║
║  Konta dostępowe:                                        ║
║  • Brygadzista:  login: brygadzista / hasło: brygadzista123 ║
║  • Księgowa:      login: ksiegowa   / hasło: ksiegowa123    ║
║                                                          ║
║  Funkcje:                                                ║
║  ✓ Panel brygadzisty - zarządzanie pracownikami i czasem ║
║  ✓ Panel księgowej - raporty, zatwierdzenia, eksport     ║
║  ✓ Jedna baza danych - brak problemów z synchronizacją   ║
╚══════════════════════════════════════════════════════════╝
    `);
});
