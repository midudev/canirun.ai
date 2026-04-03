import type { APIRoute } from 'astro';
import { renderOgImage } from '@/lib/og';

export const GET: APIRoute = async () => {
  const jpeg = await renderOgImage({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { width: '100%', height: '4px', backgroundColor: '#22c55e' },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '50px 60px',
              justifyContent: 'center',
              gap: '20px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: '12px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#22c55e',
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: 28, color: '#22c55e', fontWeight: 700 },
                        children: 'CanIRun.ai',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', marginTop: '16px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 72, fontWeight: 700, color: '#ededef', lineHeight: 1.15 },
                        children: 'Can I Run AI',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 72, fontWeight: 700, color: '#22c55e', lineHeight: 1.15 },
                        children: 'locally?',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 28, color: '#8a8a97', lineHeight: 1.5, marginTop: '8px' },
                  children: 'Detect your hardware and find out which AI models you can run locally.',
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 20, color: '#56565f', marginTop: '24px' },
                  children: 'canirun.ai — GPU, CPU, and RAM analysis in your browser',
                },
              },
            ],
          },
        },
      ],
    },
  });

  return new Response(jpeg, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
};
