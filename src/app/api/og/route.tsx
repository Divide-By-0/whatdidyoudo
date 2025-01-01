import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

async function loadGoogleFont(font: string, weight = 400) {
  const url = `https://fonts.googleapis.com/css2?family=${font}:wght@${weight}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);
 
  if (resource && resource[1]) {
    const response = await fetch(resource[1]);
    if (response.status == 200) {
      return await response.arrayBuffer();
    }
  }
 
  throw new Error('failed to load font data');
}


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const username = searchParams.get('username');
    const commits = parseInt(searchParams.get('commits') || '0');
    const issues = parseInt(searchParams.get('issues') || '0');
    const prs = parseInt(searchParams.get('prs') || '0');
    const repos = parseInt(searchParams.get('repos') || '0');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let avatarUrl = null;
    if (username) {
      const response = await fetch(`https://api.github.com/users/${username}`, {
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        avatarUrl = data.avatar_url;
      }
    }

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'black',
            fontFamily: 'Geist Regular',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            {avatarUrl && (
              <img
                src={avatarUrl}
                width="180"
                height="180"
                style={{
                  borderRadius: '100px',
                  marginBottom: '10px',
                }}
              />
            )}
            
            <span 
              style={{ 
                color: 'white', 
                fontSize: 64, 
                margin: 0, 
                fontWeight: 800,
                background: 'linear-gradient(to right, #60A5FA, #3B82F6)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
                fontFamily: 'Geist Semibold'
              }}
            >
              {username ? (
                <>What did<span style={{ color: '#60A5FA', marginLeft: '15px', marginRight: '8px' }}>{username}</span>get done?</>
              ) : (
                'GitHub Activity Summary'
              )}
            </span>
            
            <div style={{ color: '#9CA3AF', fontSize: 30, marginTop: 8, fontWeight: 500, fontFamily: 'Geist' }}>
              {startDate && endDate ? (
                `${new Date(startDate).toLocaleString('default', { month: 'short' })} ${new Date(startDate).getDate()}, ${new Date(startDate).getFullYear()} to ${new Date(endDate).toLocaleString('default', { month: 'short' })} ${new Date(endDate).getDate()}, ${new Date(endDate).getFullYear()}`
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                color: 'white',
                fontSize: 36,
              }}
            >
              {commits > 0 && <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                width: '200px',
                height: '200px',
              }}>
                <span style={{ color: '#60A5FA', fontSize: 56, fontWeight: 800, fontFamily: 'Geist Semibold', marginBottom: '4px' }}>{commits}</span>
                <span style={{ fontWeight: 500, color: '#E5E7EB', fontFamily: 'Geist Medium', fontSize: 28 }}>commits</span>
              </div>}
              {issues > 0 && <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                width: '200px',
                height: '200px',
              }}>
                <span style={{ color: '#60A5FA', fontSize: 56, fontWeight: 800, fontFamily: 'Geist Semibold', marginBottom: '4px' }}>{issues}</span>
                <span style={{ fontWeight: 500, color: '#E5E7EB', fontFamily: 'Geist Medium', fontSize: 28 }}>issues</span>
              </div>}
              {prs > 0 && <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                width: '200px',
                height: '200px',
              }}>
                <span style={{ color: '#60A5FA', fontSize: 56, fontWeight: 800, fontFamily: 'Geist Semibold', marginBottom: '4px' }}>{prs}</span>
                <span style={{ fontWeight: 500, color: '#E5E7EB', fontFamily: 'Geist Medium', fontSize: 28 }}>PRs</span>
              </div>}
              {repos > 0 && <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                width: '200px',
                height: '200px',
              }}>
                <span style={{ color: '#60A5FA', fontSize: 56, fontWeight: 800, fontFamily: 'Geist Semibold', marginBottom: '4px' }}>{repos}</span>
                <span style={{ fontWeight: 500, color: '#E5E7EB', fontFamily: 'Geist Medium', fontSize: 28 }}>repos</span>
              </div>}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "Geist Regular",
            data: await loadGoogleFont('Geist', 400),
            style: "normal",
          },
          {
            name: "Geist Medium", 
            data: await loadGoogleFont('Geist', 500),
            style: "normal",
          },
          {
            name: "Geist Bold",
            data: await loadGoogleFont('Geist', 700),
            style: "normal",
          },
          {
            name: "Geist Semibold",
            data: await loadGoogleFont('Geist', 600),
            style: "normal",
          }
        ],
      },
    );
  } catch (e) {
    console.log(`${(e as Error).message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}