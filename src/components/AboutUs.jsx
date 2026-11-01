import { useEffect, useRef, useState } from 'react';
import shopImage from '../assets/aquatica-shop.png';
import customerCouple from '../assets/customer-purchase-couple-3.png';
import customerCoupleTwo from '../assets/customer-purchase-couple-2.png';
import customerPhotoOne from '../assets/customer-purchase-customer.png';
import customerPhotoTwo from '../assets/customer-purchase-customer-2.png';
import customerPhotoThree from '../assets/customer-purchase-customer-4.png';
import customerPhotoFour from '../assets/customer-purchase-customer-3.png';
import customerPhotoFive from '../assets/customer-purchase-customer-5.png';
import customerPhotoSix from '../assets/customer-purchase-customer-6.png';
import Icon from './Icon.jsx';

const customerPhotos = [
  { src: customerCouple, alt: 'Two adult customers with their purchase at Aquatica' },
  { src: customerCoupleTwo, alt: 'Two adult customers displaying their purchase at Aquatica' },
  { src: customerPhotoOne, alt: 'Adult customer showing a purchase at Aquatica' },
  { src: customerPhotoTwo, alt: 'Adult customer showing a purchase at Aquatica' },
  { src: customerPhotoThree, alt: 'Adult customer at Aquatica' },
  { src: customerPhotoFour, alt: 'Adult customer with an aquarium outside the shop' },
  { src: customerPhotoFive, alt: 'Adult customer at Aquatica' },
  { src: customerPhotoSix, alt: 'Adult customer with a purchase at Aquatica' },
];

const openingHours = [
  ['Monday', '7:00 AM – 5:00 PM'],
  ['Tuesday', '7:00 AM – 5:00 PM'],
  ['Wednesday', '7:00 AM – 5:00 PM'],
  ['Thursday', '7:00 AM – 5:00 PM'],
  ['Friday', '7:00 AM – 5:00 PM'],
  ['Saturday', '7:00 AM – 5:00 PM'],
  ['Sunday', 'Closed'],
];

const faqTopics = ['Buying', 'Pickup and delivery', 'Fish health', 'Tank setup'];

const questions = [
  {
    topic: 'Pickup and delivery',
    question: 'Do you ship live fish?',
    answer: 'Live-fish delivery depends on your location and current conditions. Please contact us before ordering so we can confirm whether delivery is available for you.',
  },
  {
    topic: 'Fish health',
    question: 'Is there a health guarantee?',
    answer: 'Please ask us about the current health policy before buying. If a fish seems unwell after you bring it home, contact us promptly with a photo and details about your aquarium so we can understand what happened.',
  },
  {
    topic: 'Buying',
    question: 'How do I order?',
    answer: 'Log in or sign up in the web app to place an order, then browse the shop and follow the checkout steps.',
    action: { href: '#login', label: 'Log in or sign up' },
  },
  {
    topic: 'Tank setup',
    question: 'Do you set up tanks?',
    answer: 'Ask us about your tank size and setup before you buy. We can confirm which setup help is available and what would work for the fish you have in mind.',
  },
  {
    topic: 'Buying',
    question: 'What payments do you accept?',
    answer: 'Payment options can vary. Please check with us before ordering to confirm the methods currently available for your purchase.',
  },
  {
    topic: 'Pickup and delivery',
    question: 'Can I bring my own container for fish?',
    answer: 'Please message us before your visit if you plan to bring a container. We can let you know what is suitable for the fish you are taking home.',
  },
  {
    topic: 'Fish health',
    question: 'What should I do if a fish seems unwell?',
    answer: 'Check the water first and take a clear photo of the fish. Contact us with your water readings, tank details, and when you first noticed the change.',
  },
  {
    topic: 'Tank setup',
    question: 'Can I ask for advice before choosing fish?',
    answer: 'Absolutely. Bring your tank size, a photo of the setup, and any water test results. That makes it easier to talk through suitable options.',
  },
];

const carePractices = [
  {
    title: 'A close eye on new arrivals',
    description: 'We take time to observe fish and check how they are settling in before recommending them for a home aquarium.',
    imageAlt: 'Aquarium tanks and supplies inside Nasugbu Aquatica',
  },
  {
    title: 'Water is part of the routine',
    description: 'Regular water checks help us pay attention to the conditions behind a healthy-looking tank.',
    imageAlt: 'Aquarium tanks and supplies inside Nasugbu Aquatica',
  },
  {
    title: 'Daily care, done thoughtfully',
    description: 'Feeding is a chance to check each tank, notice changes, and make sure fish are behaving as expected.',
    imageAlt: 'Aquarium tanks and supplies inside Nasugbu Aquatica',
  },
];

const values = [
  {
    title: 'Healthy fish come first',
    description: 'Good care starts with clean water, close observation, and choosing fish thoughtfully.',
  },
  {
    title: 'Advice should be honest',
    description: 'The right answer is the one that suits your aquarium, not just the next thing on a shelf.',
  },
  {
    title: 'Every keeper can learn',
    description: 'A first tank and a long-loved aquarium deserve the same patience and attention.',
  },
];

const directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=Nasugbu+Aquatica%2C+Nasugbu%2C+Batangas';
const mapEmbedUrl = 'https://maps.google.com/maps?q=Nasugbu%20Aquatica%2C%20Nasugbu%2C%20Batangas&output=embed';

function getToday() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
  }).format(new Date());
}

function CareImage({ alt, className = '' }) {
  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      src={shopImage}
    />
  );
}

function CustomerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const pointerStart = useRef(null);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches);

    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % customerPhotos.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  function moveSlide(direction) {
    setActiveIndex((current) => (current + direction + customerPhotos.length) % customerPhotos.length);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSlide(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSlide(1);
    }
  }

  function handlePointerUp(event) {
    if (pointerStart.current === null) return;

    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) > 48) moveSlide(distance < 0 ? 1 : -1);
  }

  function getSlidePosition(index) {
    const offset = (index - activeIndex + customerPhotos.length) % customerPhotos.length;
    if (offset === 0) return 'current';
    if (offset === 1) return 'next';
    if (offset === customerPhotos.length - 1) return 'previous';
    return 'hidden';
  }

  return (
    <section aria-labelledby="customer-carousel-title" className="about-customer-stories">
      <div className="about-container">
        <header className="about-customer-heading">
          <h2 id="customer-carousel-title">Our customers</h2>
          <p>A few familiar faces and their visits to Aquatica.</p>
        </header>

        <div
          aria-label="Customer photos"
          aria-roledescription="carousel"
          className="about-customer-carousel"
          onKeyDown={handleKeyDown}
          onPointerCancel={() => { pointerStart.current = null; }}
          onPointerDown={(event) => { pointerStart.current = event.clientX; }}
          onPointerUp={handlePointerUp}
          role="region"
          tabIndex={0}
        >
          <p aria-live="off" className="about-carousel-status">
            Showing customer photo {activeIndex + 1} of {customerPhotos.length}
          </p>
          <button
            aria-label="Previous customer photo"
            className="about-carousel-arrow about-carousel-previous"
            onClick={() => moveSlide(-1)}
            type="button"
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div
            aria-label={`Photo ${activeIndex + 1} of ${customerPhotos.length}`}
            aria-roledescription="slide"
            className="about-carousel-stage"
            role="group"
          >
            {customerPhotos.map((photo, index) => {
              const position = getSlidePosition(index);
              return (
                <figure
                  aria-hidden={position !== 'current'}
                  className={`about-carousel-slide is-${position}`}
                  key={photo.src}
                >
                  <img alt={photo.alt} loading="lazy" src={photo.src} />
                </figure>
              );
            })}
          </div>

          <button
            aria-label="Next customer photo"
            className="about-carousel-arrow about-carousel-next"
            onClick={() => moveSlide(1)}
            type="button"
          >
            <span aria-hidden="true">›</span>
          </button>

          <div className="about-carousel-navigation">
            <div aria-label="Choose a customer photo" className="about-carousel-dots" role="group">
              {customerPhotos.map((photo, index) => (
                <button
                  aria-current={index === activeIndex ? 'true' : undefined}
                  aria-label={`Show customer photo ${index + 1}`}
                  className={index === activeIndex ? 'is-active' : ''}
                  key={photo.src}
                  onClick={() => setActiveIndex(index)}
                  type="button"
                />
                ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OurStory() {
  return (
    <section aria-labelledby="our-story-title" className="about-story" id="our-story">
      <div className="about-container">
        <header className="about-story-intro about-reveal">
          <h2 id="our-story-title">A small shop that keeps fish well.</h2>
          <p>Freshwater fish, aquarium essentials, and a friendly place to ask your questions in Nasugbu, Batangas.</p>
        </header>

        <div className="about-story-grid about-reveal">
          <figure className="about-story-photo">
            <img src={shopImage} alt="Inside Nasugbu Aquatica, with aquarium tanks along the shop floor" />
            <figcaption>A look inside Nasugbu Aquatica</figcaption>
          </figure>
          <div className="about-story-copy">
            <h2>Small worlds. <span>Thoughtful care.</span></h2>
            <p className="about-story-lead">Nasugbu Aquatica began with a simple love of aquariums—and the joy of bringing a little underwater world into the home.</p>
            <p>That love grew into a neighborhood shop where freshwater fish and aquarium essentials come together, with thoughtful care at the heart of every choice.</p>
            <p>Today, we are here for Nasugbu’s fishkeepers, from the curious first-timer setting up a tank to longtime hobbyists growing their collection. Every visit is a chance to share what we have learned and help another aquarium thrive.</p>
          </div>
        </div>

        <section aria-labelledby="fish-care-title" className="about-care about-reveal">
          <header className="about-section-heading">
            <h2 id="fish-care-title">How we care for our fish</h2>
            <p>Healthy fish are never an afterthought. Care is in the small things we do every day.</p>
          </header>
          <div className="about-care-grid">
            {carePractices.map((practice) => (
              <article className="about-care-card" key={practice.title}>
                <div className="about-care-image">
                  <CareImage alt={practice.imageAlt} />
                </div>
                <h3>{practice.title}</h3>
                <p>{practice.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="values-title" className="about-values about-reveal">
          <header className="about-section-heading">
            <h2 id="values-title">A good aquarium starts with good care.</h2>
          </header>
          <div className="about-values-grid">
            {values.map((value) => (
              <article className="about-value" key={value.title}>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="people-title" className="about-people about-reveal">
          <div className="about-people-image">
            <img src={shopImage} alt="Aquarium tanks and supplies inside Nasugbu Aquatica" loading="lazy" />
          </div>
          <div className="about-people-copy">
            <h2 id="people-title">Small team. Real fishkeeping.</h2>
            <p>We are a hands-on local shop, here to help you choose fish and supplies with your aquarium in mind. Drop by with a question—or a photo of your tank—and say hello.</p>
            <a href="#visit-us">Come and meet us <Icon name="arrow" className="h-4 w-4" /></a>
          </div>
        </section>
      </div>
    </section>
  );
}

function VisitUs() {
  const today = getToday();

  return (
    <section aria-labelledby="visit-us-title" className="about-visit" id="visit-us">
      <div className="about-container">
        <header className="about-section-heading about-visit-heading about-reveal">
          <h2 id="visit-us-title">Come by the shop.</h2>
          <p>There is nothing like seeing the fish in person. We would love to have you in.</p>
        </header>

        <div className="about-visit-grid about-reveal">
          <div className="about-map">
            <iframe
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapEmbedUrl}
              title="Map showing Nasugbu Aquatica in Nasugbu, Batangas"
            />
            <a className="about-directions" href={directionsUrl} rel="noreferrer" target="_blank">
              <Icon name="route" className="h-4 w-4" />
              Get directions
              <Icon name="arrow" className="h-4 w-4" />
            </a>
          </div>

          <div className="about-visit-details">
            <div className="about-address">
              <Icon name="location" className="h-5 w-5" />
              <div>
                <h3>Where to find us</h3>
                <p>Nasugbu, Batangas, Philippines</p>
                <p className="about-visit-note">Use the map directions to find the shop. If you have trouble spotting the entrance, please check with us before your trip.</p>
              </div>
            </div>

            <div className="about-hours">
              <div className="about-hours-heading">
                <h3><Icon name="clock" className="h-4 w-4" /> Opening hours</h3>
                <span>Philippine time</span>
              </div>
              <table>
                <tbody>
                  {openingHours.map(([day, hours]) => (
                    <tr aria-current={day === today ? 'date' : undefined} className={day === today ? 'is-today' : ''} key={day}>
                      <th scope="row">{day}{day === today && <span>Today</span>}</th>
                      <td>{hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="about-visitor-notes">
              <h3>A couple of things before you visit</h3>
              <p>Bring a suitable, secure container if you already have one for your fish. For large tanks, message us first so we can check what is available.</p>
            </aside>
          </div>
        </div>

        <div className="about-shop-photos about-reveal">
          <figure>
            <img src={shopImage} alt="The aquarium shop entrance and tanks" loading="lazy" />
            <figcaption>Come on in</figcaption>
          </figure>
          <figure>
            <img src={shopImage} alt="Aquarium displays inside Nasugbu Aquatica" loading="lazy" />
            <figcaption>A look around the shop</figcaption>
          </figure>
        </div>

      </div>
    </section>
  );
}

function Faq() {
  const [topic, setTopic] = useState('All questions');

  const filteredQuestions = questions.filter((item) => topic === 'All questions' || item.topic === topic);

  return (
    <section aria-labelledby="faq-title" className="about-faq" id="faq">
      <div className="about-container">
        <header className="about-section-heading about-reveal">
          <h2 id="faq-title">Good to know.</h2>
          <p>Quick answers before you visit or place an order.</p>
        </header>

        <div className="about-faq-tools about-reveal">
          <div aria-label="Filter questions by topic" className="about-faq-topics" role="group">
            {['All questions', ...faqTopics].map((item) => (
              <button
                aria-pressed={topic === item}
                className={topic === item ? 'is-active' : ''}
                key={item}
                onClick={() => setTopic(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite" className="about-faq-list about-reveal">
          {filteredQuestions.length > 0 ? filteredQuestions.map((item) => (
            <details className="about-faq-item" key={item.question}>
              <summary>{item.question}<span aria-hidden="true" /></summary>
              <div className="about-faq-answer">
                <p>{item.answer}</p>
                {item.action && <a href={item.action.href}>{item.action.label} <Icon name="arrow" className="h-4 w-4" /></a>}
              </div>
            </details>
          )) : null}
        </div>

        <aside className="about-faq-cta about-reveal">
          <div>
            <h3>Didn’t find your answer?</h3>
            <p>Get in touch and tell us what you are trying to figure out.</p>
          </div>
          <a href="#visit-us">Talk to the shop <Icon name="arrow" className="h-4 w-4" /></a>
        </aside>
      </div>
    </section>
  );
}

export default function AboutUs() {
  useEffect(() => {
    const elements = document.querySelectorAll('.about-page .about-reveal');

    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.08 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="about-page">
      <OurStory />
      <CustomerCarousel />
      <VisitUs />
      <Faq />
    </div>
  );
}
