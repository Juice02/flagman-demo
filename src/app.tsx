import { StrictMode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { userFromParams } from './allowlist'
import { useFlag } from './flags'
import { ServerStatus } from './ServerStatus'

type Book = { title: string; author: string; genre: 'Fiction' | 'Non-fiction'; blurb: string }

const BOOKS: Book[] = [
  { title: 'Piranesi', author: 'Susanna Clarke', genre: 'Fiction', blurb: 'A man maps an endless house of halls and tides.' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genre: 'Non-fiction', blurb: 'How two modes of thinking shape everyday choices.' },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', genre: 'Fiction', blurb: 'An envoy on a winter planet where gender is fluid.' },
  { title: 'The Gene', author: 'Siddhartha Mukherjee', genre: 'Non-fiction', blurb: 'The history and future of heredity.' },
  { title: 'A Suitable Boy', author: 'Vikram Seth', genre: 'Fiction', blurb: 'A mother looks for a husband for her daughter in 1950s India.' },
  { title: 'Educated', author: 'Tara Westover', genre: 'Non-fiction', blurb: 'A memoir of leaving an isolated family for university.' },
  { title: 'The Remains of the Day', author: 'Kazuo Ishiguro', genre: 'Fiction', blurb: 'An English butler looks back on a life of service.' },
  { title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', genre: 'Non-fiction', blurb: 'Botany and Indigenous knowledge, side by side.' },
]

const user = userFromParams(new URLSearchParams(location.search))

function BookLogger() {
  const dark = useFlag('dark-mode', user)
  const hideNonFiction = useFlag('hide-non-fiction', user)
  const books = hideNonFiction.enabled ? BOOKS.filter((b) => b.genre === 'Fiction') : BOOKS

  return (
    <div className="bl" data-theme={dark.enabled ? 'dark' : 'light'}>
      <header className="bl-head">
        <p className="bl-logo">Book Logger</p>
        <p className="bl-user">{user.id}</p>
      </header>
      <main className="bl-main">
        {window.parent === window && <ServerStatus className="bl-note bl-status" />}
        <h1>Recommended for you</h1>
        <p className="bl-sub">{books.length} picks{hideNonFiction.enabled && ' · fiction only'}</p>
        <ul className="bl-list">
          {books.map((b) => (
            <li key={b.title} className="bl-book">
              <div className="bl-cover" style={{ '--hue': (BOOKS.indexOf(b) * 47) % 360 } as CSSProperties} aria-hidden="true" />
              <div className="bl-book__text">
                <p className="bl-title">{b.title}</p>
                <p className="bl-meta">{b.author}</p>
                <p className="bl-blurb">{b.blurb}</p>
              </div>
              <span className="bl-genre">{b.genre}</span>
            </li>
          ))}
        </ul>
        {(dark.error || hideNonFiction.error) && (
          <p className="bl-note" role="status">Can't reach FlagMan. Showing the last known settings.</p>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><BookLogger /></StrictMode>)
