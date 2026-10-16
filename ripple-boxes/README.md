# Rippler

Two small water-ripple experiments in WebGL, in one Next.js app.

> **Inspiration:** this project was inspired by
> [@MoizArshi29's post on X](https://x.com/MoizArshi29/status/2100228031113793717).
> The original effect is theirs; this is a from-scratch recreation and exploration of it.

## Pages

- **`/` Rings:** expanding water rings over any image you choose. Sliders for speed, spacing, refraction,
  wave front, glass texture, highlight and colour split. Click to move the centre, or let it follow the cursor.
  Settings can be saved to and loaded from a JSON file.
- **`/boxes` Boxes:** click a rounded box and a ripple leaves its edges, bounces off the other boxes,
  rolls off the screen and dies down. This is a real wave simulation on the GPU.

A menu at the top switches between the two.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## How it's built

- `lib/ringsRenderer.ts`: the Rings effect. A WebGL1 fragment shader draws travelling wave crests and
  refracts the image by the surface slope.
- `lib/rippleEngine.ts`: the Boxes effect. A WebGL2 wave-equation simulation where the boxes are walls,
  the off-screen margin absorbs waves, and damping makes them fade.
- `lib/paintBackground.ts`: generates the default painted landscape, so no image assets are needed.
- `components/`: the React pages and the top menu, which also holds the inspiration credit.
