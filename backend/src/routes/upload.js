import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import { requireAuth } from "../middleware/auth.js";
import { uploadToS3, S3_FOLDERS } from "../utils/s3.js";

// Memory storage — buffer is streamed straight to S3, never written to EC2 disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|mp4|mov|avi/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error("File type not allowed"), false);
  },
});

const router = Router();

router.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  try {
    const ext      = path.extname(req.file.originalname) || ".bin";
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const url = await uploadToS3({
      buffer:   req.file.buffer,
      mimetype: req.file.mimetype,
      folder:   S3_FOLDERS.uploads,
      filename,
    });
    res.json({ url, name: req.file.originalname, size: req.file.size });
  } catch (err) {
    next(err);
  }
});

export default router;
