const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("./config/db");

require("dotenv").config();

const { Resend } = require("resend");   // send the mail
const resend = new Resend(process.env.RESEND_API_KEY);
//part of scan
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");


const app = express();
app.use(express.json());

//scan
const upload = multer({ dest: "uploads/" });

const AI_BASE_URL = "https://mahmoudberam-dawai-backend.hf.space";      // chatbot



app.get("/", (req, res) => {
  res.send("Dawai Backend Running");
});

  // save the history
function saveToHistory(user_id, medicine_id) {
  console.log("Saving History:", user_id, medicine_id);

  const query =
    "INSERT INTO search_history (user_id, medicine_id) VALUES (?, ?)";

  db.query(query, [user_id, medicine_id], (err) => {
    if (err) {
      console.log("HISTORY SAVE ERROR:", err);
    } else {
      console.log("History saved successfully");
    }
  });
}




app.post("/register", async (req, res) => {
  console.log("REGISTER BODY:", req.body);

  const { name, age, email, phone, password } = req.body;
  const confirmPassword = req.body.confirmPassword || req.body.confirm_password;

  if (!name || !age || !email || !phone || !password || !confirmPassword) {
    return res.status(400).json({
      message: "من فضلك أدخل جميع البيانات",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      message: "كلمة المرور غير متطابقة",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query =
      "INSERT INTO users (name, age, email, phone, password) VALUES (?, ?, ?, ?, ?)";

    db.query(query, [name, age, email, phone, hashedPassword], (err, result) => {
      if (err) {
        console.log("DATABASE ERROR:", err);

        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            message: "هذا البريد الإلكتروني مستخدم بالفعل",
          });
        }

        return res.status(500).json({
          message: "حدث خطأ أثناء إنشاء الحساب",
          error: err.message,
        });
      }

      if (result.affectedRows === 1) {
        return res.status(201).json({
          message: "تم إنشاء الحساب بنجاح",
          userId: result.insertId,
        });
      }

      return res.status(500).json({
        message: "لم يتم إنشاء الحساب، حاول مرة أخرى",
      });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "حدث خطأ غير متوقع",
    });
  }
});





app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "من فضلك أدخل البريد الإلكتروني وكلمة المرور",
    });
  }

  const query = "SELECT * FROM users WHERE email = ?";

  db.query(query, [email], async (err, results) => {
    if (err) {
      console.log("LOGIN ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء تسجيل الدخول",
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        message: "المستخدم غير موجود",
      });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "كلمة المرور غير صحيحة",
      });
    }

    return res.json({
      message: "تم تسجيل الدخول بنجاح",
      user_id: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        age: user.age,
      },
    });
  }); 
});




//api search medicine
app.get("/medicines", (req, res) => {
  const query = "SELECT * FROM medicines";

  db.query(query, (err, results) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        message: "حدث خطأ أثناء جلب الأدوية",
      });
    }

    res.json(results);
  });
});


//api medicine search 
app.post("/search", (req, res) => {
  console.log("SEARCH BODY:", req.body);
  const { medicine_name, user_id } = req.body;

  if (!medicine_name) {
    return res.status(400).json({
      message: "من فضلك أدخل اسم الدواء",
    });
  }

  const query = `
    SELECT *
    FROM medicines
    WHERE name_en LIKE ? OR name_ar LIKE ?
    LIMIT 1
  `;

  db.query(query, [`%${medicine_name}%`, `%${medicine_name}%`], (err, results) => {
    if (err) {
      console.log("SEARCH ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء البحث",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "لم يتم العثور على الدواء",
      });
    }

    const medicine = results[0];

    if (user_id) {
      saveToHistory(user_id, medicine.id);
    }

    return res.json({
      Name_AR: medicine.name_ar,
      Uses: medicine.uses,
      SideEffects: medicine.side_effects,
    });
  });
});





// auto complete
app.get("/autocomplete", (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.json([]);
  }

  const query = `
    SELECT name_en, name_ar
    FROM medicines
    WHERE name_en LIKE ? OR name_ar LIKE ?
    LIMIT 10
  `;

  db.query(query, [`%${q}%`, `%${q}%`], (err, results) => {
    if (err) {
      console.log("AUTOCOMPLETE ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء جلب الاقتراحات",
      });
    }

    const suggestions = results.map((medicine) => {
      return medicine.name_ar || medicine.name_en;
    });

    return res.json(suggestions);
  });
});




// api Search Medicine using ID




// api History
app.get("/history/:user_id", (req, res) => {
  const { user_id } = req.params;

  const query = `
    SELECT 
      m.id,
      m.name_en,
      m.name_ar,
      m.category,
      m.uses,
      m.side_effects,
      h.searched_at
    FROM search_history h
    JOIN medicines m ON h.medicine_id = m.id
    WHERE h.user_id = ?
    ORDER BY h.searched_at DESC
  `;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      console.log("HISTORY FETCH ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء جلب السجل",
      });
    }

    return res.json(results);
  });
});



// Endpoint Scan

app.post("/scan", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "من فضلك ارفع صورة الدواء",
      });
    }

    // تجهيز الصورة للإرسال للـ AI
    const formData = new FormData();

    formData.append("file", fs.createReadStream(req.file.path));

    // إرسال الصورة للـ AI
    const aiResponse = await axios.post(
      "https://mahmoudberam-dawai-backend.hf.space/scan",
      formData,
      {
        headers: formData.getHeaders(),
      }
    );
      
    console.log(aiResponse.data); // عشان اقدر اشوف ال AI رجع ايه


    // استلام medicine_id من الـ AI
    const medicine_id = aiResponse.data.medicine_id;

    // لو AI ملقاش الدواء
    if (!aiResponse.data.found || !medicine_id) {
      fs.unlinkSync(req.file.path);

      return res.status(404).json({
        message: "لم يتم التعرف على الدواء",
      });
    }

    // البحث عن الدواء في الداتابيز
    const query = "SELECT * FROM medicines WHERE id = ?";

    db.query(query, [medicine_id], (err, results) => {
      // حذف الصورة المؤقتة
      fs.unlinkSync(req.file.path);

      if (err) {
        console.log("SCAN DB ERROR:", err);

        return res.status(500).json({
          message: "حدث خطأ أثناء جلب بيانات الدواء",
        });
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: "لم يتم العثور على الدواء",
        });
      }

      const medicine = results[0];

      // حفظ في history (اختياري)
      // لو Flutter بعتت user_id
      const user_id = req.body.user_id;

      if (user_id) {
        saveToHistory(user_id, medicine.id);
      }

      // إرسال البيانات لفلاتر
      return res.json({
        Name_AR: medicine.name_ar,
        Uses: medicine.uses,
        SideEffects: medicine.side_effects,
      });
    });
  } catch (error) {
    console.log("SCAN ERROR:", error.message);

    // حذف الصورة لو حصل error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      message: "حدث خطأ أثناء تحليل الصورة",
    });
  }
});





// api forgotpassword

app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "من فضلك أدخل البريد الإلكتروني",
    });
  }

  // نتأكد إن الإيميل موجود
  const checkQuery = "SELECT * FROM users WHERE email = ?";

  db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      console.log("FORGOT PASSWORD ERROR:", err);

      return res.status(500).json({
        message: "حدث خطأ أثناء التحقق من البريد الإلكتروني",
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "البريد الإلكتروني غير موجود",
      });
    }

    // توليد OTP عشوائي
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // صلاحية الكود 10 دقائق
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // حفظ OTP في الداتابيز
    const insertQuery = `
      INSERT INTO password_resets (email, otp, expires_at)
      VALUES (?, ?, ?)
    `;

    db.query(insertQuery, [email, otp, expiresAt], async (err) => {
      if (err) {
        console.log("OTP SAVE ERROR:", err);

        return res.status(500).json({
          message: "حدث خطأ أثناء حفظ OTP",
        });
      }

      try { 
        // إرسال الإيميل
        await resend.emails.send({
          from: "Dawai <onboarding@resend.dev>",
          to: email,
          subject: "Dawai Password Reset OTP",
          text: `Your OTP code is: ${otp}`,
        });

        return res.json({
          message: "تم إرسال OTP إلى البريد الإلكتروني",
        });
      } catch (emailError) {
        console.log("EMAIL ERROR:", emailError);

        return res.status(500).json({
          message: "حدث خطأ أثناء إرسال البريد الإلكتروني",
        });
      }
    });
  });
});





// Verify OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      message: "من فضلك أدخل البريد الإلكتروني وكود التحقق",
    });
  }

  const query = `
    SELECT *
    FROM password_resets
    WHERE email = ?
    AND otp = ?
    AND is_used = 0
    AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.query(query, [email, otp], (err, results) => {
    if (err) {
      console.log("VERIFY OTP ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء التحقق من الكود",
      });
    }

    if (results.length === 0) {
      return res.status(400).json({
        message: "كود التحقق غير صحيح أو منتهي الصلاحية",
      });
    }

    return res.json({
      message: "تم التحقق من الكود بنجاح",
    });
  });
});




// reset-password
app.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword, confirmPassword } = req.body;

  if (!email || !otp || !newPassword || !confirmPassword) {
    return res.status(400).json({
      message: "من فضلك أدخل جميع البيانات",
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      message: "كلمة المرور غير متطابقة",
    });
  }

  const query = `
    SELECT *
    FROM password_resets
    WHERE email = ?
    AND otp = ?
    AND is_used = 0
    AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.query(query, [email, otp], async (err, results) => {
    if (err) {
      console.log("RESET PASSWORD ERROR:", err);

      return res.status(500).json({
        message: "حدث خطأ أثناء التحقق من الكود",
      });
    }

    if (results.length === 0) {
      return res.status(400).json({
        message: "الكود غير صحيح أو منتهي الصلاحية",
      });
    }

    try {
      // تشفير الباسورد الجديد
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // تحديث الباسورد
      const updatePasswordQuery = `
        UPDATE users
        SET password = ?
        WHERE email = ?
      `;

      db.query(updatePasswordQuery, [hashedPassword, email], (err) => {
        if (err) {
          console.log("UPDATE PASSWORD ERROR:", err);

          return res.status(500).json({
            message: "حدث خطأ أثناء تحديث كلمة المرور",
          });
        }

        // تعليم OTP إنه اتستخدم
        const updateOtpQuery = `
          UPDATE password_resets
          SET is_used = 1
          WHERE email = ? AND otp = ?
        `;

        db.query(updateOtpQuery, [email, otp]);

        return res.json({
          message: "تم تغيير كلمة المرور بنجاح",
        });
      });
    } catch (error) {
      console.log(error);

      return res.status(500).json({
        message: "حدث خطأ غير متوقع",
      });
    }
  });
});





// api chatbot

app.post("/chat", (req, res) => {
  console.log(req.body);    // عرض من فلاتر اللى بتبعته
  const { user_id, message } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({
      message: "من فضلك أدخل الرسالة وبيانات المستخدم",
    });
  }

  const getSessionQuery =
  "SELECT last_medicine_id, last_disease_type FROM user_chat_sessions WHERE user_id = ?";

  db.query(getSessionQuery, [user_id], async (err, rows) => {
    if (err) {
      console.log("CHAT SESSION ERROR:", err);
      return res.status(500).json({
        message: "حدث خطأ أثناء جلب بيانات المحادثة",
      });
    }

      let lastMedicineId = 0;
      let lastDiseaseType = null;

      if (rows.length > 0) {
        lastMedicineId = rows[0].last_medicine_id || 0;
        lastDiseaseType = rows[0].last_disease_type || null;
      }

    try {
        const aiResponse = await axios.post(`${AI_BASE_URL}/chat`, {
        message: message,
        medicine_id: lastMedicineId,
        disease_type: lastDiseaseType,
      });

      const aiData = aiResponse.data;

      const reply = aiData.response;
      const newMedicineId = aiData.medicine_id;
      const newDiseaseType = aiData.disease_type;

    if (
      (newMedicineId && newMedicineId !== lastMedicineId) ||
      (newDiseaseType && newDiseaseType !== lastDiseaseType)
    ) {
      const updateSessionQuery = `
        INSERT INTO user_chat_sessions (user_id, last_medicine_id, last_disease_type)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          last_medicine_id = ?,
          last_disease_type = ?
      `;

      db.query(
        updateSessionQuery,
        [
          user_id,
          newMedicineId || lastMedicineId,
          newDiseaseType || lastDiseaseType,
          newMedicineId || lastMedicineId,
          newDiseaseType || lastDiseaseType,
        ],
        (err) => {
          if (err) {
            console.log("CHAT MEMORY UPDATE ERROR:", err);
          }
        }
      );
    }

     return res.json({
      reply: reply,
      medicine_id: newMedicineId || lastMedicineId,
      disease_type: newDiseaseType || lastDiseaseType,
    });
    } catch (error) {
      console.log("CHAT AI ERROR:", error.response?.data || error.message);
      console.log("CHAT AI STATUS:", error.response?.status);

      return res.status(500).json({
        message: "حدث خطأ أثناء التواصل مع الشات بوت",
      });
    }
  });
});




const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});