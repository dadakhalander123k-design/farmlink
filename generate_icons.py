import os
from PIL import Image, ImageDraw

src_img_path = r"C:/Users/vsbha/.gemini/antigravity/brain/1717ac4f-faf0-40be-8e94-82a9e5728a60/.user_uploaded/media_1791294532196.jpg"
res_dir = r"C:/Users/vsbha/farmlink/farmlink/android/app/src/main/res"

img = Image.open(src_img_path).convert("RGBA")

# Mipmap densities and sizes
# ic_launcher standard: 48, 72, 96, 144, 192
# ic_launcher_foreground: 108, 162, 216, 324, 432
densities = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

# 1. Generate standard and adaptive icons
for folder, (std_size, fg_size) in densities.items():
    folder_path = os.path.join(res_dir, folder)
    os.makedirs(folder_path, exist_ok=True)
    
    # Standard square icon
    std_icon = img.resize((std_size, std_size), Image.Resampling.LANCZOS)
    std_icon.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")
    
    # Round icon
    mask = Image.new("L", (std_size, std_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, std_size, std_size), fill=255)
    round_icon = Image.new("RGBA", (std_size, std_size), (0, 0, 0, 0))
    round_icon.paste(std_icon, (0, 0), mask=mask)
    round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
    
    # Adaptive foreground (icon centered with ~18% safe padding on each side)
    fg_canvas = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
    inner_size = int(fg_size * 0.72)
    inner_img = img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = (fg_size - inner_size) // 2
    fg_canvas.paste(inner_img, (offset, offset), mask=inner_img if inner_img.mode == "RGBA" else None)
    fg_canvas.save(os.path.join(folder_path, "ic_launcher_foreground.png"), "PNG")

# 2. Generate splash screens
splash_densities = {
    "drawable-port-mdpi": (320, 480, 160),
    "drawable-port-hdpi": (480, 800, 240),
    "drawable-port-xhdpi": (720, 1280, 360),
    "drawable-port-xxhdpi": (960, 1600, 480),
    "drawable-port-xxxhdpi": (1280, 1920, 640),
    "drawable-land-mdpi": (480, 320, 160),
    "drawable-land-hdpi": (800, 480, 240),
    "drawable-land-xhdpi": (1280, 720, 360),
    "drawable-land-xxhdpi": (1600, 960, 480),
    "drawable-land-xxxhdpi": (1920, 1280, 640),
}

bg_color = (232, 220, 198, 255) # Mocha Cream #E8DCC6

for folder, (w, h, logo_size) in splash_densities.items():
    folder_path = os.path.join(res_dir, folder)
    os.makedirs(folder_path, exist_ok=True)
    splash = Image.new("RGBA", (w, h), bg_color)
    logo_resized = img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    ox = (w - logo_size) // 2
    oy = (h - logo_size) // 2
    splash.paste(logo_resized, (ox, oy), mask=logo_resized if logo_resized.mode == "RGBA" else None)
    splash.save(os.path.join(folder_path, "splash.png"), "PNG")

# 3. Copy logo to web assets
for target_dir in [r"C:/Users/vsbha/farmlink/farmlink/assets/images", r"C:/Users/vsbha/farmlink/farmlink/public/images"]:
    os.makedirs(target_dir, exist_ok=True)
    img.save(os.path.join(target_dir, "logo.png"), "PNG")

print("All Android icons, splash screens, and web assets generated successfully!")
