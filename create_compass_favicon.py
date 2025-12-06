from PIL import Image, ImageDraw
import os

def create_compass_favicon(output_dir="search-for-medicine-test03", size=64, output_path=None):
    """
    方位磁針のデザインのファビコンを作成します。
    :param output_dir: 出力ディレクトリのパス
    :param size: ファビコンのサイズ（正方形）
    :param output_path: 出力ファイルの完全パス (指定しない場合は自動生成)
    """
    img = Image.new('RGBA', (size, size), (255, 255, 255, 0)) # 透明な背景
    draw = ImageDraw.Draw(img)

    center_x, center_y = size // 2, size // 2
    radius = int(size * 0.4)

    # 外側の円
    draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius),
                 fill=(200, 200, 200, 255), outline=(100, 100, 100, 255))

    # 北を指す赤い針
    draw.polygon([
        (center_x, center_y - radius + size * 0.05),
        (center_x - size * 0.08, center_y),
        (center_x + size * 0.08, center_y)
    ], fill=(255, 0, 0, 255))

    # 南を指す灰色の針
    draw.polygon([
        (center_x, center_y + radius - size * 0.05),
        (center_x - size * 0.08, center_y),
        (center_x + size * 0.08, center_y)
    ], fill=(150, 150, 150, 255))

    # 中心点
    draw.ellipse((center_x - size * 0.05, center_y - size * 0.05,
                  center_x + size * 0.05, center_y + size * 0.05),
                 fill=(0, 0, 0, 255))

    if output_path is None:
        output_path = os.path.join(output_dir, f"favicon-{size}.ico")
    
    # 出力ディレクトリが存在しない場合は作成
    os.makedirs(os.path.dirname(output_path), exist_ok=True) # exist_ok=True を追加
    
    img.save(output_path)
    print(f"ファビコンを {output_path} に作成しました。")

if __name__ == "__main__":
    output_dir = "search-for-medicine-test03"
    sizes = [16, 32, 48, 64, 96, 128, 192, 256, 512] # 一般的なファビコンサイズ

    for s in sizes:
        create_compass_favicon(output_dir=output_dir, size=s)
    
    # 標準の favicon.ico (最大サイズまたは最も一般的な192x192)
    create_compass_favicon(output_dir=output_dir, size=192, output_path=os.path.join(output_dir, "favicon.ico"))