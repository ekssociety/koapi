const express = require('express');
const puppeteer = require('puppeteer-core');
const { executablePath } = require('puppeteer'); // Puppeteer'ın doğru sürümünü alacağız

const app = express();
const port = 3000;

// Sunucu adları ve quantity verileri
const serverNames = {
    "zero": 72,
    "pandora": 66,
    "agartha": 67,
    "felis": 68,
    "destan": 9,
    "minark": 79,
    "dryads": 80,
    "oreads": 82
};

// Sunucu adlarını customer-store-product-id'ye göre eşleştir
const serverMappingKopazar = {
    "zero": 72,
    "pandora": 66,
    "agartha": 67,
    "felis": 68,
    "destan": 9,
    "minark": 79,
    "dryads": 80,
    "oreads": 82
};

const serverMappingSonteklif = {
    "20": "Zero",
    "19": "Pandora",
    "5": "Felis",
    "17": "Minark",
    "3": "Destan",
    "4": "Dryads",
    "18": "Oreads",
};

const serverMappingVatangame = {
    "14": "Zero",
    "12": "Agartha",
    "13": "Felis",
    "11": "Pandora",
    "23": "Oreads",
    "15": "Minark",
    "22": "Dryads",
    "8": "Destan",
};

// Fiyatları iki ondalık basamağa yuvarlayan fonksiyon
const formatPrice = (price) => {
    return parseFloat(price).toFixed(2);  // Sayıyı iki ondalık basamağa yuvarla
};

// Puppeteer fiyat çekme fonksiyonları
const getBynogamePrices = async (serverName, page) => {
    const baseUrl = "https://www.bynogame.com/tr/oyunlar/knight-online/gold-bar/";
    const url = `${baseUrl}${serverName}`;
    await page.goto(url);

    const salesPriceElement = await page.$eval('p.font-weight-bolder.m-0.product_price', el => el.getAttribute('data-price'));
    const purchasePriceElement = await page.$eval('p.col-sm-24.font-weight-bolder', el => el.innerText.trim().split()[0]);

    if (salesPriceElement && purchasePriceElement) {
        return { server: serverName.charAt(0).toUpperCase() + serverName.slice(1), buyPrice: parseFloat(purchasePriceElement), sellPrice: parseFloat(salesPriceElement), source: 'ByNoGame' };
    }
    return null;
};

const getKopazarPrices = async (server, quantity, page) => {
    const url = `https://www.kopazar.com/knight-online-gold-bar/${server}`;
    await page.goto(url);
    await page.waitForSelector('input[name="quantity' + quantity + '"]', { timeout: 10000 });

    const sellPrice = await page.$eval(`input[name='quantity${quantity}']`, el => parseFloat(el.getAttribute("data-sellprice")));
    const buyPrice = await page.$eval(`input[name='quantity${quantity}']`, el => parseFloat(el.getAttribute("data-buyprice")));

    return { server: server.charAt(0).toUpperCase() + server.slice(1), buyPrice: buyPrice * 10, sellPrice: sellPrice * 10, source: 'Kopazar' };
};

const getSonteklifPrices = async (productId, page) => {
    const url = "https://www.sonteklif.com/knight-online-gb-c-2";
    await page.goto(url);
    await page.waitForSelector('button.btn-price-chart', { timeout: 10000 });

    const buttons = await page.$$eval('button.btn-price-chart', btns => btns.map(btn => ({
        customerId: btn.getAttribute("data-customer-store-product-id"),
        buyPrice: btn.getAttribute("data-buy-price"),
        sellPrice: btn.getAttribute("data-price")
    })));

    const priceData = buttons.find(button => button.customerId == productId);
    if (priceData) {
        const serverName = serverMappingSonteklif[productId] || "Bilinmiyor";
        return { server: serverName, buyPrice: parseFloat(priceData.buyPrice) * 10, sellPrice: parseFloat(priceData.sellPrice) * 10, source: 'SonTeklif' };
    }
    return null;
};

const getVatangamePrices = async (productId, page) => {
    const url = "https://www.vatangame.com/oyun-parasi/knight-online-gold-bar";
    await page.goto(url);
    await page.waitForSelector('a.modal-button', { timeout: 10000 });

    const buyButtons = await page.$$eval('a[data-modal="#buy-modal"]', btns => btns.map(btn => ({
        productId: btn.getAttribute("data-product-id"),
        price: btn.getAttribute("data-price")
    })));

    const sellButtons = await page.$$eval('a[data-modal="#sell-to-us-modal"]', btns => btns.map(btn => ({
        productId: btn.getAttribute("data-product-id"),
        price: btn.getAttribute("data-price")
    })));

    const buyButton = buyButtons.find(b => b.productId == productId);
    const sellButton = sellButtons.find(s => s.productId == productId);

    if (buyButton && sellButton) {
        const serverName = serverMappingVatangame[productId] || "Bilinmiyor";
        const buyPrice = parseFloat(sellButton.price);
        const sellPrice = parseFloat(buyButton.price);

        // Agartha, Zero, Felis, Pandora: 100 ile çarp, diğerleri 10 ile çarp
        if (productId === "12" || productId === "14" || productId === "13" || productId === "11") {
            return { server: serverName, buyPrice: buyPrice * 100, sellPrice: sellPrice * 100, source: 'Vatangame' };
        } else {
            return { server: serverName, buyPrice: buyPrice * 10, sellPrice: sellPrice * 10, source: 'Vatangame' };
        }
    }
    return null;
};

// API Route'ları
app.get('/prices/knight-online', async (req, res) => {
    const browser = await puppeteer.launch({
        headless: true,  // Headless modda çalışması için
        executablePath: executablePath(),  // Puppeteer'ın doğru sürümünü kullan
    });
    const page = await browser.newPage();

    let allPrices = [];

    // Kopazar fiyatlarını alalım
    for (const [server, quantity] of Object.entries(serverNames)) {
        const price = await getKopazarPrices(server, quantity, page);
        if (price) {
            allPrices.push(price);
        }
    }

    // ByNoGame fiyatlarını alalım
    for (const server of Object.keys(serverNames)) {
        const price = await getBynogamePrices(server, page);
        if (price) {
            allPrices.push(price);
        }
    }

    // SonTeklif fiyatlarını alalım
    for (const productId of Object.keys(serverMappingSonteklif)) {
        const price = await getSonteklifPrices(productId, page);
        if (price) {
            allPrices.push(price);
        }
    }

    // VatanGame fiyatlarını alalım
    for (const productId of Object.keys(serverMappingVatangame)) {
        const price = await getVatangamePrices(productId, page);
        if (price) {
            allPrices.push(price);
        }
    }

    await browser.close();

    // Fiyatları JSON olarak döndür
    res.json(allPrices);
});

app.listen(port, () => {
    console.log(`API server is running on http://localhost:${port}`);
});
