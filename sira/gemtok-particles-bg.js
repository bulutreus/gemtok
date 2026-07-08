/**
 * Yerel sıra sayfaları: canvas parçacık ağı + .reveal/.stagger-children gözlemcisi +
 * sayaç ve oyun kartı eğimi (önceden prod-common.min.js + jQuery ile geliyordu).
 */
(function () {
  function run() {
    var canvas = document.getElementById("particles-canvas");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var particles = [];
    var mouseX = 0;
    var mouseY = 0;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function Particle() {
      this.reset();
    }
    Particle.prototype.reset = function () {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = 2 * Math.random() + 0.5;
      this.speedX = 0.5 * (Math.random() - 0.5);
      this.speedY = 0.5 * (Math.random() - 0.5);
      this.opacity = 0.5 * Math.random() + 0.2;
    };
    Particle.prototype.update = function () {
      this.x += this.speedX;
      this.y += this.speedY;
      var dx = mouseX - this.x;
      var dy = mouseY - this.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150 && dist > 0.5) {
        var f = (150 - dist) / 150;
        this.x -= (dx / dist) * f * 2;
        this.y -= (dy / dist) * f * 2;
      }
      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;
    };
    Particle.prototype.draw = function () {
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(0.1, this.size), 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(0, 212, 255, " + this.opacity + ")";
      ctx.fill();
    };

    function initParticles() {
      particles = [];
      var n = Math.min(100, Math.floor((canvas.width * canvas.height) / 15000));
      for (var i = 0; i < n; i++) particles.push(new Particle());
    }

    function connectParticles() {
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            var alpha = 0.15 * (1 - d / 120);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = "rgba(0, 212, 255, " + alpha + ")";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animateParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var p = 0; p < particles.length; p++) {
        particles[p].update();
        particles[p].draw();
      }
      connectParticles();
      requestAnimationFrame(animateParticles);
    }

    resizeCanvas();
    initParticles();
    animateParticles();
    window.addEventListener("resize", function () {
      resizeCanvas();
      initParticles();
    });
    document.addEventListener("mousemove", function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    var revealEls = document.querySelectorAll(".reveal, .stagger-children");
    if (revealEls.length && "IntersectionObserver" in window) {
      var revObs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) en.target.classList.add("active");
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
      );
      revealEls.forEach(function (el) {
        revObs.observe(el);
      });
    }

    var counters = document.querySelectorAll(".counter");
    if (counters.length && "IntersectionObserver" in window) {
      var ctrObs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var el = entry.target;
            var target = parseInt(el.getAttribute("data-target"), 10);
            ctrObs.unobserve(el);
            if (isNaN(target)) return;
            var dur = 2000;
            var t0 = performance.now();
            function tick(now) {
              var u = Math.min((now - t0) / dur, 1);
              var eased = 1 - Math.pow(1 - u, 3);
              el.textContent = String(Math.floor(eased * target));
              if (u < 1) requestAnimationFrame(tick);
              else el.textContent = String(target);
            }
            requestAnimationFrame(tick);
          });
        },
        { threshold: 0.5 }
      );
      counters.forEach(function (c) {
        ctrObs.observe(c);
      });
    }

    document.querySelectorAll(".game-card").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        var mx = r.width / 2;
        var my = r.height / 2;
        var rotX = (y - my) / 20;
        var rotY = (mx - x) / 20;
        card.style.transform =
          "translateY(-10px) rotateX(" + rotX + "deg) rotateY(" + rotY + "deg)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var href = this.getAttribute("href");
        if (!href || href === "#") return;
        var t = document.querySelector(href);
        if (t) {
          e.preventDefault();
          t.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
