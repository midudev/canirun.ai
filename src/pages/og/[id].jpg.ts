import type { APIRoute, GetStaticPaths } from 'astro';
import { models } from '@/data/models';
import { renderOgImage, badge } from '@/lib/og';

export const getStaticPaths: GetStaticPaths = () =>
  models.map((model) => ({
    params: { id: model.id },
    props: { model },
  }));

function getModelBadges(model: (typeof models)[number]) {
  const badges = [];
  if (model.featured)
    badges.push(badge('★ Popular', '#facc15', 'rgba(250,204,21,0.1)', 'rgba(250,204,21,0.3)'));
  if (model.architecture === 'moe')
    badges.push(badge('MoE', '#3b82f6', 'rgba(59,130,246,0.1)', 'rgba(59,130,246,0.3)'));
  if (model.tools)
    badges.push(badge('Tool Use', '#a855f7', 'rgba(168,85,247,0.1)', 'rgba(168,85,247,0.3)'));
  if (model.thinking)
    badges.push(badge('Thinking', '#38bdf8', 'rgba(56,189,248,0.1)', 'rgba(56,189,248,0.3)'));
  if (model.useCase.includes('vision'))
    badges.push(badge('Vision', '#fb7185', 'rgba(251,113,133,0.1)', 'rgba(251,113,133,0.3)'));
  return badges;
}

export const GET: APIRoute = async ({ props }) => {
  const { model } = props as { model: (typeof models)[number] };

  const contextStr =
    model.contextLength >= 1024
      ? `${Math.round(model.contextLength / 1024)}K`
      : String(model.contextLength);
  const archStr = model.architecture === 'moe' ? 'MoE' : 'Dense';
  const vram = (model.quants.find((q) => q.name === 'Q4_K_M') || model.quants[0]).vramGB;
  const displayName = model.name.length > 32 ? model.name.slice(0, 30) + '…' : model.name;
  const displayDesc =
    model.description.length > 120 ? model.description.slice(0, 117) + '...' : model.description;

  const modelBadges = getModelBadges(model);

  const useCaseTags = model.useCase.slice(0, 4).map((tag: string) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        padding: '6px 16px',
        borderRadius: '6px',
        border: '1px solid #333',
        backgroundColor: '#111',
        fontSize: 16,
        color: '#8a8a97',
      },
      children: tag,
    },
  }));

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
              padding: '40px 60px 50px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', gap: '10px' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                backgroundColor: '#22c55e',
                              },
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { fontSize: 22, color: '#22c55e', fontWeight: 700 },
                              children: 'CanIRun.ai',
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: 18, color: '#56565f' },
                        children: 'canirun.ai',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    justifyContent: 'center',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 58, fontWeight: 700, color: '#ededef', lineHeight: 1.1 },
                        children: displayName,
                      },
                    },
                    ...(modelBadges.length > 0
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '14px',
                                flexWrap: 'wrap',
                              },
                              children: modelBadges,
                            },
                          },
                        ]
                      : []),
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 24,
                          color: '#8a8a97',
                          marginTop: modelBadges.length > 0 ? '14px' : '12px',
                        },
                        children: `${model.provider} · ${model.params} · ${archStr} · ${contextStr} context`,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 24, color: '#6a6a77', lineHeight: 1.5, marginTop: '12px' },
                        children: displayDesc,
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
                  children: [
                    ...useCaseTags,
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '6px 16px',
                          borderRadius: '6px',
                          border: '1px solid rgba(34,197,94,0.3)',
                          backgroundColor: 'rgba(34,197,94,0.1)',
                          fontSize: 16,
                          color: '#22c55e',
                        },
                        children: `Q4_K_M · ${vram} GB VRAM`,
                      },
                    },
                  ],
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
