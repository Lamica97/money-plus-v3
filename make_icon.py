import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE = 1024
scale = 2  # 512 * 2

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

# 1. Background Squircle with Gradient
bg_mask = Image.new('L', (SIZE, SIZE), 0)
bg_mask_draw = ImageDraw.Draw(bg_mask)
margin = int(24 * scale)
r = int(118 * scale)
bg_mask_draw.rounded_rectangle([margin, margin, SIZE - margin, SIZE - margin], radius=r, fill=255)

# Rich Emerald Gradient
grad = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
grad_draw = ImageDraw.Draw(grad)
for y in range(SIZE):
    t = y / SIZE
    # #10b981 (16, 185, 129) -> #059669 (5, 150, 105) -> #047857 (4, 120, 87)
    if t < 0.5:
        sub_t = t / 0.5
        rv = int(16 * (1 - sub_t) + 5 * sub_t)
        gv = int(185 * (1 - sub_t) + 150 * sub_t)
        bv = int(129 * (1 - sub_t) + 105 * sub_t)
    else:
        sub_t = (t - 0.5) / 0.5
        rv = int(5 * (1 - sub_t) + 4 * sub_t)
        gv = int(150 * (1 - sub_t) + 120 * sub_t)
        bv = int(105 * (1 - sub_t) + 87 * sub_t)
    grad_draw.line([(0, y), (SIZE, y)], fill=(rv, gv, bv, 255))

bg = Image.composite(grad, img, bg_mask)

# 2. Highlight Border
border_draw = ImageDraw.Draw(bg)
inner_margin = int(27 * scale)
inner_r = int(115 * scale)
border_draw.rounded_rectangle([inner_margin, inner_margin, SIZE - inner_margin, SIZE - inner_margin],
                              radius=inner_r, outline=(255, 255, 255, 55), width=int(5 * scale))

# 3. Draw bold 'M' using Segoe UI Bold Font
shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
s_draw = ImageDraw.Draw(shadow)

fg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
fg_draw = ImageDraw.Draw(fg)

font_size = int(280 * scale)
font = ImageFont.truetype('C:\\Windows\\Fonts\\segoeuib.ttf', font_size)

# Calculate text bounding box
text = "M"
bbox = fg_draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]

# Position M slightly shifted left/down to balance the top-right '+' badge
tx = (SIZE - text_w) // 2 - int(24 * scale)
ty = (SIZE - text_h) // 2 - bbox[1] + int(24 * scale)

# Draw shadow for M
s_offset = int(12 * scale)
s_draw.text((tx, ty + s_offset), text, font=font, fill=(2, 44, 34, 110))

# Draw M
fg_draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))

# 4. Golden Plus Badge in Top Right
badge_cx = int(380 * scale)
badge_cy = int(150 * scale)
badge_r = int(68 * scale)

# Badge shadow
b_offset = int(8 * scale)
s_draw.ellipse([badge_cx - badge_r, badge_cy + b_offset - badge_r,
                badge_cx + badge_r, badge_cy + b_offset + badge_r], fill=(2, 44, 34, 130))

# Badge border
fg_draw.ellipse([badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
                fill=(245, 158, 11, 255), outline=(255, 255, 255, 255), width=int(6 * scale))

# Badge gradient fill (Amber/Gold)
inner_br = badge_r - int(6 * scale)
for by in range(badge_cy - inner_br, badge_cy + inner_br + 1):
    dy = by - badge_cy
    dx_max = int(math.sqrt(max(0, inner_br*inner_br - dy*dy)))
    bt = (by - (badge_cy - inner_br)) / (2 * inner_br)
    br_col = int(253 * (1 - bt) + 245 * bt)
    bg_col = int(224 * (1 - bt) + 158 * bt)
    bb_col = int(71 * (1 - bt) + 11 * bt)
    fg_draw.line([(badge_cx - dx_max, by), (badge_cx + dx_max, by)], fill=(br_col, bg_col, bb_col, 255))

# White Plus sign in badge
plus_len = int(32 * scale)
plus_w = int(15 * scale)
# Horizontal
fg_draw.rounded_rectangle([badge_cx - plus_len, badge_cy - plus_w//2,
                           badge_cx + plus_len, badge_cy + plus_w//2],
                          radius=plus_w//2, fill=(255, 255, 255, 255))
# Vertical
fg_draw.rounded_rectangle([badge_cx - plus_w//2, badge_cy - plus_len,
                           badge_cx + plus_w//2, badge_cy + plus_len],
                          radius=plus_w//2, fill=(255, 255, 255, 255))

# 5. Blur shadow
shadow = shadow.filter(ImageFilter.GaussianBlur(int(10 * scale)))

# 6. Composite layers
final_img = Image.alpha_composite(bg, shadow)
final_img = Image.alpha_composite(final_img, fg)

# Save images
img_512 = final_img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save('icon-512.png', 'PNG')
img_512.save('apple-touch-icon.png', 'PNG')

img_64 = final_img.resize((64, 64), Image.Resampling.LANCZOS)
img_64.save('favicon-64.png', 'PNG')

img_32 = final_img.resize((32, 32), Image.Resampling.LANCZOS)
img_32.save('favicon.png', 'PNG')

final_img.save('favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

print("Successfully generated perfect crisp icons!")
