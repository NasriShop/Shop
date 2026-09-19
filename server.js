const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// التأكد من وجود مجلد رفع الصور
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// الاتصال بقاعدة البيانات MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://zoubirimp2026_db_user:QxatnDM1y2MzBL48@cluster0.l5jbnnu.mongodb.net/nasri_shop?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ خطأ قاعدة البيانات:', err.message));

// إعداد التخزين المحلي للصور
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Schemas
const Product = mongoose.model('Product', new mongoose.Schema({
    name: String,
    category: String,
    price: Number,
    old_price: Number,
    badge: String,
    description: String,
    image_url: String,
    is_featured: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    customer_name: String,
    phone: String,
    wilaya: String,
    baladia: String,
    product_name: String,
    price: Number,
    shipping_price: Number,
    total_price: Number,
    shipping_type: String,
    created_at: { type: Date, default: Date.now }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 1. جلب المنتجات
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ is_featured: -1, created_at: -1 });
        res.json(products.map(p => ({
            id: p._id.toString(),
            name: p.name,
            category: p.category,
            price: p.price,
            old_price: p.old_price,
            badge: p.badge,
            description: p.description,
            image_url: p.image_url || 'https://via.placeholder.com/300',
            is_featured: p.is_featured || false
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. إضافة منتج
app.post('/api/admin/products', upload.single('image_file'), async (req, res) => {
    try {
        const { name, category, price, old_price, badge, description, is_featured } = req.body;
        let image_url = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/300';

        if (is_featured === 'true' || is_featured === true) {
            await Product.updateMany({}, { is_featured: false });
        }

        const newProd = new Product({
            name, category,
            price: parseFloat(price),
            old_price: parseFloat(old_price || 0),
            badge, description, image_url,
            is_featured: is_featured === 'true' || is_featured === true
        });

        await newProd.save();
        res.json({ success: true, product: newProd });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 3. تعديل منتج
app.put('/api/admin/products/:id', upload.single('image_file'), async (req, res) => {
    try {
        const { name, category, price, old_price, badge, description, is_featured } = req.body;
        
        if (is_featured === 'true' || is_featured === true) {
            await Product.updateMany({}, { is_featured: false });
        }

        const updateData = {
            name, category,
            price: parseFloat(price),
            old_price: parseFloat(old_price || 0),
            badge, description,
            is_featured: is_featured === 'true' || is_featured === true
        };
        if (req.file) updateData.image_url = `/uploads/${req.file.filename}`;

        const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, product: updated });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 4. جعل المنتج هو المستهدف الرئيسي في الأشهار
app.post('/api/admin/products/:id/feature', async (req, res) => {
    try {
        await Product.updateMany({}, { is_featured: false });
        const featuredProd = await Product.findByIdAndUpdate(req.params.id, { is_featured: true }, { new: true });
        res.json({ success: true, product: featuredProd });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 5. حذف منتج
app.delete('/api/admin/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 6. جلب الطلبات
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ created_at: -1 });
        res.json(orders.map(o => ({
            id: o._id.toString(),
            customer_name: o.customer_name,
            phone: o.phone,
            wilaya: o.wilaya,
            baladia: o.baladia,
            product_name: o.product_name,
            total_price: o.total_price,
            shipping_type: o.shipping_type,
            created_at: o.created_at
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 7. إضافة طلب جديد
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.json({ success: true, order: newOrder });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 8. أرشفة الطلب إلى Google Sheets وحذفه من قاعدة البيانات (معالجة سريعة وبدون أخطاء CORS)
app.post('/api/orders/:id/archive', async (req, res) => {
    try {
        const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxo3uCYHT1kDKvhBgi2NVmhAAYsrv6zNBSWsOrKHc-lq6FrV3obyN4xE37gsYMPTX8/exec";
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
        }

        const payload = new URLSearchParams({
            customerName: order.customer_name || '',
            phone: order.phone || '',
            wilaya: order.wilaya || '',
            commune: order.baladia || '',
            productName: order.product_name || '',
            totalPrice: order.total_price || 0,
            shippingType: order.shipping_type === 'home' ? 'منزل' : 'مكتب'
        });

        // إرسال البيانات لـ Apps Script
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString()
        });

        // حذف الطلب من قاعدة البيانات بعد التصدير
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم أرشفة الطلب بنجاح إلى Google Sheets وحذفه من المتجر!' });
    } catch (err) {
        console.error('خطأ الأرشفة:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 السيرفر يعمل بنجاح على المنفذ: ${PORT}`));