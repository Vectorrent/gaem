# gaem


The Problem:

- Our current approach tries to smoothly interpolate between views
- But a cube is fundamentally DISCRETE
- Faces are either visible or not
- Edges are sharp, not gradual
- We can't smoothly interpolate between "cube" and "not cube"


Mathematical Understanding:

- Consider a cube rotating 90 degrees:
- A face doesn't smoothly transform
- It discretely appears/disappears
- Our interpolation assumes continuous transformation
- But cube visibility is actually discontinuous