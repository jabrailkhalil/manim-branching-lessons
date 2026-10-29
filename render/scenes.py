"""Three real Manim clips. No LaTeX or browser-side Python is required."""

from manim import (
    BLUE_C,
    DOWN,
    GREEN_C,
    LEFT,
    ORANGE,
    RED_C,
    RIGHT,
    UP,
    Arrow,
    Axes,
    Create,
    Dot,
    FadeIn,
    Scene,
    Text,
    VGroup,
    Write,
)


class Base(Scene):
    def setup(self):
        self.camera.background_color = "#0b1220"

    def title(self, text):
        return Text(text, font_size=34, color=GREEN_C).to_edge(UP, buff=0.35)

    def graph(self):
        axes = Axes(
            x_range=[0, 3.5, 1], y_range=[0, 10, 2], x_length=7, y_length=4, tips=False
        ).shift(LEFT * 1.8 + DOWN * 0.3)
        curve = axes.plot(lambda x: x * x, x_range=[0, 3.1], color=BLUE_C)
        label = Text("f(x) = x²", font_size=28).move_to(RIGHT * 3.3 + UP * 1.5)
        self.play(Create(axes), Create(curve), Write(label))
        return axes


class Question(Base):
    def construct(self):
        self.add(self.title("One gradient step"))
        axes = self.graph()
        point = Dot(axes.c2p(2, 4), color=ORANGE)
        self.play(FadeIn(point))
        labels = (
            VGroup(
                Text("Start: x = 2", font_size=25),
                Text("Gradient: 2x = 4", font_size=25),
                Text("Learning rate: 0.25", font_size=25),
                Text("Next: x − 0.25 × 2x", font_size=25, color=GREEN_C),
            )
            .arrange(DOWN, aligned_edge=LEFT, buff=0.3)
            .move_to(RIGHT * 3.5 + DOWN * 0.4)
        )
        self.play(Write(labels))
        self.wait(3)


class Correction(Base):
    def construct(self):
        self.add(self.title("Check the direction"))
        axes = self.graph()
        start = Dot(axes.c2p(2, 4), color=ORANGE)
        end = Dot(axes.c2p(3, 9), color=RED_C)
        self.add(start)
        self.play(
            Create(Arrow(start.get_center(), end.get_center(), buff=0.12, color=RED_C)),
            FadeIn(end),
        )
        lines = (
            VGroup(
                Text("Adding goes uphill", font_size=25, color=RED_C),
                Text("2 + 0.25 × 4 = 3", font_size=25),
                Text("Loss: 4 → 9", font_size=25),
                Text("Descent subtracts", font_size=25, color=GREEN_C),
            )
            .arrange(DOWN, aligned_edge=LEFT, buff=0.3)
            .move_to(RIGHT * 3.5 + DOWN * 0.4)
        )
        self.play(Write(lines))
        self.wait(3)


class Success(Base):
    def construct(self):
        self.add(self.title("A step downhill"))
        axes = self.graph()
        start = Dot(axes.c2p(2, 4), color=ORANGE)
        end = Dot(axes.c2p(1, 1), color=GREEN_C)
        self.add(start)
        self.play(
            Create(
                Arrow(start.get_center(), end.get_center(), buff=0.12, color=GREEN_C)
            ),
            FadeIn(end),
        )
        lines = (
            VGroup(
                Text("2 − 0.25 × 4 = 1", font_size=25, color=GREEN_C),
                Text("Loss: 4 → 1", font_size=25),
                Text("One step, lower loss", font_size=25),
            )
            .arrange(DOWN, aligned_edge=LEFT, buff=0.3)
            .move_to(RIGHT * 3.5 + DOWN * 0.4)
        )
        self.play(Write(lines))
        self.wait(3)
