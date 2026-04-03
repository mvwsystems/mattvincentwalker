function toggleNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');
  const isOpen = links.classList.contains('open');
  toggle.classList.toggle('active');
  links.classList.toggle('open');
  overlay.classList.toggle('open');
  // Prevent body scroll when nav is open
  document.body.style.overflow = isOpen ? '' : 'hidden';
}

// Close nav on page switch
function closeNav() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  const overlay = document.getElementById('navOverlay');
  toggle.classList.remove('active');
  links.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ═══ SCROLL REVEAL (enhanced with variants) ═══
function observeReveals() {
  const els = document.querySelectorAll('.reveal:not(.visible), .reveal-up:not(.visible), .reveal-scale:not(.visible), .reveal-left:not(.visible), .reveal-right:not(.visible)');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  els.forEach(el => observer.observe(el));
}
document.addEventListener('DOMContentLoaded', () => {
  // On pages without the loader, show nav immediately
  if (!document.getElementById('loader')) {
    const nav = document.querySelector('nav');
    if (nav) { nav.style.animation = 'none'; nav.style.opacity = '1'; }
  }
  observeReveals();
  injectShineAndBtnLayers();
});

// ═══ INJECT SHINE AND BUTTON LAYERS ═══
function injectShineAndBtnLayers() {
  document.querySelectorAll('.card, .article-card, .tier').forEach(el => {
    if (!el.querySelector('.shine-layer')) {
      const s = document.createElement('div');
      s.className = 'shine-layer';
      el.appendChild(s);
    }
  });
  document.querySelectorAll('.btn-primary').forEach(el => {
    if (!el.querySelector('.btn-shine')) {
      const s = document.createElement('div');
      s.className = 'btn-shine';
      el.appendChild(s);
    }
  });
}

// ═══ NAV SCROLL ═══
window.addEventListener('scroll', () => {
  const nav = document.querySelector('nav');
  if (window.scrollY > 100) {
    nav.style.background = 'rgba(12,10,9,0.98)';
  } else {
    nav.style.background = 'linear-gradient(to bottom, rgba(12,10,9,0.95) 0%, rgba(12,10,9,0.7) 70%, transparent 100%)';
  }
});

// ═══ CUSTOM CURSOR ═══
const cursor = document.createElement('div');
cursor.className = 'custom-cursor';
document.body.appendChild(cursor);
const dot = document.createElement('div');
dot.className = 'cursor-dot';
document.body.appendChild(dot);

let cx = 0, cy = 0, dx = 0, dy = 0;
document.addEventListener('mousemove', e => {
  dx = e.clientX; dy = e.clientY;
  dot.style.left = dx + 'px'; dot.style.top = dy + 'px';
});

function animateCursor() {
  cx += (dx - cx) * 0.12;
  cy += (dy - cy) * 0.12;
  cursor.style.left = cx + 'px';
  cursor.style.top = cy + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

// Hover detection for cursor
const hoverTargets = 'a, button, .btn-primary, .btn-secondary, .card, .article-card, .testimonial, .tier, .numbered-row, .nav-toggle';
document.addEventListener('mouseover', e => {
  if (e.target.closest(hoverTargets)) cursor.classList.add('hovering');
});
document.addEventListener('mouseout', e => {
  if (e.target.closest(hoverTargets)) cursor.classList.remove('hovering');
});

// Hide default cursor
document.body.style.cursor = 'none';
document.querySelectorAll('a, button, input, select, textarea').forEach(el => el.style.cursor = 'none');

// ═══ MAGNETIC BUTTONS ═══
document.querySelectorAll('.btn-primary, .nav-cta').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
  });
});

// ═══ HERO PARTICLES ═══
function createParticles() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 2 + 1;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = (50 + Math.random() * 50) + '%';
    p.style.background = Math.random() > 0.5 ? 'var(--amber-dim)' : 'var(--ash)';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    hero.appendChild(p);
  }
}
createParticles();

// ═══ PARALLAX ON SCROLL ═══
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  // Parallax hero elements
  const heroName = document.querySelector('.hero-name');
  const heroBadge = document.querySelector('.hero-badge');
  if (heroName && scrollY < window.innerHeight) {
    heroName.style.transform = `translateY(${scrollY * 0.08}px)`;
    if (heroBadge) heroBadge.style.transform = `translateY(${scrollY * 0.04}px)`;
  }
});

// ═══ STAGGERED CHILDREN ANIMATION ═══
function staggerChildren(selector, delay = 0.08) {
  document.querySelectorAll(selector).forEach(parent => {
    const children = parent.children;
    Array.from(children).forEach((child, i) => {
      child.style.transitionDelay = (i * delay) + 's';
    });
  });
}
staggerChildren('.cards-grid', 0.1);
staggerChildren('.tiers-grid', 0.12);
staggerChildren('.testimonials-grid', 0.1);

// ═══ COUNTER ANIMATION FOR STATS ═══
function animateCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const text = el.textContent;
        // Only animate pure numbers
        if (/^\d+$/.test(text.trim())) {
          const target = parseInt(text);
          let current = 0;
          const increment = target / 40;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) { el.textContent = target; clearInterval(timer); }
            else el.textContent = Math.floor(current);
          }, 30);
        }
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat-num').forEach(el => observer.observe(el));
}
animateCounters();

// ═══ SMOOTH SECTION LABEL LINES ═══
// Handled by CSS .visible .section-label::before

// ═══ TILT EFFECT ON CARDS ═══
document.querySelectorAll('.card, .tier').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `translateY(-4px) perspective(600px) rotateX(${y * -3}deg) rotateY(${x * 3}deg)`;
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
  });
});
