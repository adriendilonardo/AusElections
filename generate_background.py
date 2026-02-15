from PIL import Image
import numpy as np
import math

def make_ternary_bg(
    out_path="ternary_bg.png",
    width=2000,                 # output width in pixels
    colorA=(229, 0, 0),        # bottom-left corner
    colorB=(0, 0, 255),        # bottom-right corner
    colorC=(119, 119, 119),       # top corner
):
    """
    Creates an equilateral-triangle ternary background PNG:
    - triangle vertices: A (0,H), B (W,H), C (W/2, 0)
    - barycentric blend of (colorA, colorB, colorC)
    - transparent outside the triangle
    """

    W = int(width)
    H = int(round(W * math.sqrt(3) / 2))

    # Triangle vertices
    Ax, Ay = 0.0, float(H)
    Bx, By = float(W), float(H)
    Cx, Cy = float(W) / 2.0, 0.0

    # Precompute denominator for barycentric coordinates
    denom = (By - Cy) * (Ax - Cx) + (Cx - Bx) * (Ay - Cy)
    if denom == 0:
        raise ValueError("Degenerate triangle geometry.")

    # Pixel grid
    xs = np.linspace(0, W - 1, W, dtype=np.float32)
    ys = np.linspace(0, H - 1, H, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys)

    # Barycentric coordinates (a,b,c) for point (X,Y) wrt triangle (A,B,C)
    a = ((By - Cy) * (X - Cx) + (Cx - Bx) * (Y - Cy)) / denom
    b = ((Cy - Ay) * (X - Cx) + (Ax - Cx) * (Y - Cy)) / denom
    c = 1.0 - a**2 - b**2  # Use sqrt to maintain proper barycentric weights

    # Inside triangle mask
    inside = (a >= 0) & (b >= 0) & (c >= 0)

    # Blend colours
    colA = np.array(colorA, dtype=np.float32)
    colB = np.array(colorB, dtype=np.float32)
    colC = np.array(colorC, dtype=np.float32)

    rgb = (
        a[..., None]**2 * colA +
        b[..., None]**2 * colB +
        c[..., None]**2 * colC
    )

    # Clamp + convert
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)

    # Alpha: 255 inside triangle, 0 outside
    alpha = np.zeros((H, W), dtype=np.uint8)
    alpha[inside] = int(255/1.5)

    rgba = np.dstack([rgb, alpha])

    img = Image.fromarray(rgba, mode="RGBA")
    img.save(out_path)
    print(f"Saved {out_path} ({W}x{H})")

if __name__ == "__main__":
    make_ternary_bg(
        out_path="Assets/ternary_bg.png",
        width=2000,
        colorA=(229, 0, 0),
        colorB=(0, 0, 255),
        colorC=(119, 119, 119),
    )
