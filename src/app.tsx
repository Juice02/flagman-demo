import { StrictMode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import { userFromParams } from './allowlist'
import { useFlag } from './flags'

type Book = { title: string; author: string; genre: 'Fiction' | 'Non-fiction'; status: 'Reading' | 'Finished' | 'Want to read' }

const BOOKS: Book[] = [
  { title: 'Piranesi', author: 'Susanna Clarke', genre: 'Fiction', status: 'Reading' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genre: 'Non-fiction', status: 'Reading' },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', genre: 'Fiction', status: 'Finished' },
  { title: 'The Gene', author: 'Siddhartha Mukherjee', genre: 'Non-fiction', status: 'Want to read' },
  { title: 'A Suitable Boy', author: 'Vikram Seth', genre: 'Fiction', status: 'Want to read' },
  { title: 'Educated', author: 'Tara Westover', genre: 'Non-fiction', status: 'Finished' },
  { title: 'The Remains of the Day', author: 'Kazuo Ishiguro', genre: 'Fiction', status: 'Finished' },
  { title: 'Braiding Sweetgrass', author: 'Robin Wall Kimmerer', genre: 'Non-fiction', status: 'Want to read' },
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
        <h1>My shelf</h1>
        <p className="bl-sub">{books.length} books{hideNonFiction.enabled && ' · fiction only'}</p>
        <ul className="bl-list">
          {books.map((b, i) => (
            <li key={b.title} className="bl-book">
              <div className="bl-cover" style={{ '--hue': (i * 47) % 360 } as CSSProperties} aria-hidden="true" />
              <div className="bl-book__text">
                <p className="bl-title">{b.title}</p>
                <p className="bl-meta">{b.author} · {b.genre}</p>
              </div>
              <span className="bl-status">{b.status}</span>
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
