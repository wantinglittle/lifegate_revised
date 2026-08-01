// Communities data
const communities = [
    {
        title: "Bible Study",
        description: "Deep dive into scripture with fellow believers in small, intimate groups",
        icon: "fas fa-book-open",
        iconColor: "blue",
        imageUrl: "images/bible_study.jpg",
        animationClass: "slide-left"
    },
    {
        title: "Prayer",
        description: "Come together in prayer, supporting one another through life's journey",
        icon: "fas fa-heart",
        iconColor: "yellow",
        imageUrl: "images/prayer.jpg",
        animationClass: "fade-up"
    },
    {
        title: "Social Activities",
        description: "Board games, movie nights, and fun activities that build lasting friendships",
        icon: "fas fa-gamepad",
        iconColor: "orange",
        imageUrl: "images/dinnergroup.jpg",
        animationClass: "slide-right"
    },
    {
        title: "LIFEStyle",
        description: "Support for the shared walk of everyday living in both regular and unique seasons of life",
        icon: "fas fa-running",
        iconColor: "green",
        imageUrl: "images/exercise.jpg",
        animationClass: "slide-left"
    },
    {
        title: "Book Studies",
        description: "Explore meaningful books together and grow through shared learning and discussion",
        icon: "fas fa-book",
        iconColor: "orange",
        imageUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
        animationClass: "fade-up"
    },
    {
        title: "Service Projects",
        description: "Make a difference in your community through organized service projects",
        icon: "fas fa-hands-helping",
        iconColor: "blue",
        imageUrl: "https://images.unsplash.com/photo-1559027615-cd4628902d4a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=400",
        animationClass: "slide-right"
    }
];

// Scroll effect for floating icons
let scrollY = 0;

function updateScrollEffect() {
    scrollY = window.scrollY;
    const floatingIcons = document.querySelectorAll('.floating-icon');
    
    floatingIcons.forEach(icon => {
        icon.style.transform = `translateY(${scrollY * 0.2}px)`;
    });
}

// Intersection Observer for animations
function createIntersectionObserver() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    return observer;
}

// Create community cards
function createCommunityCard(community, index) {
    const card = document.createElement('div');
    card.className = `community-card ${community.animationClass}`;
    card.id = `card-${community.title.replace(/\s+/g, '-').toLowerCase()}`;
    
    card.innerHTML = `
        <img 
            src="${community.imageUrl}" 
            alt="${community.title}"
            class="community-image"
        />
        <div class="community-content">
            <i class="community-icon ${community.icon} ${community.iconColor}"></i>
            <h3 class="community-title">${community.title}</h3>
            <p class="community-description">${community.description}</p>
        </div>
    `;
    
    return card;
}

// Populate communities grid
function populateCommunities() {
    const grid = document.getElementById('communities-grid');
    const observer = createIntersectionObserver();
    
    communities.forEach((community, index) => {
        const card = createCommunityCard(community, index);
        grid.appendChild(card);
        observer.observe(card);
    });
}

async function updateCollectivesPromo() {
    const promo = document.getElementById('collectives-promo');
    if (!promo) return;

    try {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./supabase-config.js');
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/get_collectives_public_state`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        if (!response.ok) return;
        const state = await response.json();
        promo.hidden = !(Array.isArray(state) && state[0]?.enabled === true);
    } catch (error) {
        console.warn('Collectives seasonal visibility could not be loaded.', error);
    }
}

function setupCollectivesInfoModal() {
    const openButton = document.getElementById('collectives-more-info');
    const modal = document.getElementById('collectives-info-modal');
    const panel = modal?.querySelector('.collectives-info-panel');
    const closeButton = document.getElementById('collectives-info-close');
    if (!openButton || !modal || !panel || !closeButton) return;

    function openModal() {
        modal.hidden = false;
        panel.focus();
    }

    function closeModal() {
        modal.hidden = true;
        openButton.focus();
    }

    openButton.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (!modal.hidden && event.key === 'Escape') {
            closeModal();
        }
    });
}

// Button click handlers (updated to use direct links)
function handleExploreClick() {
    console.log('Explore Communities clicked');
    window.location.href = 'find-comm.html';
}

function handleAddCommunityClick() {
    console.log('Add Your Community clicked');
    window.location.href = 'add-comm.html';
}

// Smooth scrolling for internal links
function smoothScrollTo(target) {
    const element = document.querySelector(target);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Initialize page
function initializePage() {
    // Populate communities
    populateCommunities();
    updateCollectivesPromo();
    setupCollectivesInfoModal();
    
    // Add scroll event listener for parallax effect
    window.addEventListener('scroll', updateScrollEffect);
    
    // Add click handler for scroll indicator
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            smoothScrollTo('.communities-section');
        });
    }
    
    // Add loading animation delay for hero content
    setTimeout(() => {
        const heroText = document.querySelector('.hero-text');
        if (heroText) {
            heroText.style.animation = 'fadeInUp 1s ease-out';
        }
    }, 100);
    
    console.log('Lifegate Church page initialized successfully!');
}

// Run initialization when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage);

// Optional: Add window resize handler for responsive adjustments
window.addEventListener('resize', () => {
    // Handle any responsive adjustments here if needed
    updateScrollEffect();
});
