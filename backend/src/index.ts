import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Caption } from './types';
import { Canvas, FabricImage, Rect, Textbox } from 'fabric/node';

// -------------------
// Load environment variables
// -------------------
dotenv.config();

// -------------------
// App Initialization
// -------------------
const app: Application = express();

// Port configuration (fallback to 3000 if not set in .env)
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// -------------------
// Middleware
// -------------------
app.use(express.json());
app.use(cors());

// -------------------
// Endpoint
// -------------------
app.post('/generateCaption', async (req: Request, res: Response) => {
  // ----------------------------------------- Handle Authorization
  const providedKey: string = req.headers['x-api-key'] as string;

  if (providedKey != process.env.API_KEY) {
    res.status(403).send('Invalid API Key');
    return;
  }

  // Setup Canvas
  const imageUrl = req.body.imageUrl;
  const caption: Caption = req.body.caption;

  const canvas = new Canvas(undefined, {
    width: 700,
    height: 400,
    devicePixelRatio: 1,
    renderOnAddRemove: false,
  });

  // Standard image dimensions (16:9)
  const targetWidth = 700;
  const targetHeight = 400; // 16:9 aspect ratio for 700px width

  // Adjust the canvas size to encompass all elements.
  canvas.setDimensions({
    width: targetWidth,
    height: targetHeight,
  });

  // ------------------------------------------ Top Bar Caption
  let updatedTopBannerHeight = 0;
  if (caption.topExtendedCaption) {
    const topText = new Textbox(caption.topExtendedCaption.toUpperCase(), {
      left: targetWidth / 2,
      fill: caption.topExtensionWhite ? 'black' : 'white',
      fontSize: 32,
      width: 700,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'center',
      textAlign: 'center',
    });
    const textLines = topText.textLines.length;
    topText.set('top', (textLines * 32) / 2 + 10);
    const topBanner = new Rect({
      left: 0,
      top: 0,
      width: targetWidth,
      height: textLines * 32 + 20,
      fill: caption.topExtensionWhite ? 'white' : 'black',
      selectable: false,
      evented: false,
    });
    updatedTopBannerHeight = topBanner.height;
    canvas.add(topBanner);
    canvas.add(topText);
    canvas.renderAll();
  }

  // ------------------------------------------ Bottom Banner Caption
  let updatedBottomBannerHeight = 0;
  if (caption.bottomExtendedCaption) {
    const bottomText = new Textbox(caption.bottomExtendedCaption.toUpperCase(), {
      left: targetWidth / 2,
      width: 700,
      fill: caption.bottomExtensionWhite ? 'black' : 'white',
      fontSize: 32,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'center',
      textAlign: 'center',
    });
    const textLines = bottomText.textLines.length;
    bottomText.set('top', targetHeight + updatedTopBannerHeight + (textLines * 32) / 2 + 10);
    const bottomBanner = new Rect({
      left: 0,
      top: updatedTopBannerHeight + targetHeight, // Position below the image.
      width: targetWidth,
      height: textLines * 32 + 20,
      fill: caption.bottomExtensionWhite ? 'white' : 'black',
      selectable: false,
      evented: false,
    });
    updatedBottomBannerHeight = bottomBanner.height;
    canvas.add(bottomBanner);
    canvas.add(bottomText);
    canvas.renderAll();
  }

  // ---------- Adjust the canvas size to encompass all elements.
  canvas.setDimensions({
    width: targetWidth,
    height: updatedTopBannerHeight + targetHeight + updatedBottomBannerHeight,
  });

  // ------------------------------------------ Image
  const img = await FabricImage.fromURL(imageUrl);
  img.set({
    scaleX: targetWidth / img.width,
    scaleY: targetHeight / img.height,
    left: 0,
    top: updatedTopBannerHeight,
    originX: 'left',
    originY: 'top',
  });
  canvas.backgroundImage = img;
  canvas.renderAll();

  // ------------------------------------------ Top Caption
  if (caption.topCaption) {
    const topText = new Textbox(caption.topCaption.toUpperCase(), {
      left: targetWidth / 2,
      top: updatedTopBannerHeight,
      fill: 'white',
      fontSize: 32,
      width: 700,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'center',
      textAlign: 'center',
    });
    // If there’s no banner, add a white stroke for contrast.
    topText.set('top', updatedTopBannerHeight + (topText.textLines.length * 32) / 2 + 10);
    topText.set({ stroke: 'black', strokeWidth: 2 });
    canvas.add(topText);
    canvas.renderAll();
  }

  // ------------------------------------------ Bottom Caption
  if (caption.bottomCaption) {
    const bottomText = new Textbox(caption.bottomCaption.toUpperCase(), {
      left: targetWidth / 2,
      fill: 'white',
      width: 700,
      fontSize: 32,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'center',
      textAlign: 'center',
    });
    bottomText.set(
      'top',
      updatedTopBannerHeight + targetHeight - (bottomText.textLines.length * 32) / 2 - 10
    );
    bottomText.set({ stroke: 'black', strokeWidth: 2 });
    canvas.add(bottomText);
    canvas.renderAll();
  }

  // Return as Base64
  res.send(canvas.toDataURL({ format: 'jpeg', multiplier: 1 }));
});

// -------------------
// 404 Handler
// -------------------
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// -------------------
// Error Handler
// -------------------
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// -------------------
// Start Server
// -------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// -------------------
// Graceful Shutdown
// -------------------
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
