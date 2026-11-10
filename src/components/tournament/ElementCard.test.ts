import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ElementCard from './ElementCard.vue'
import type { ElementItem } from '@/stores/elements'

const ELEMENT: ElementItem = {
  id: 'e1',
  userId: null,
  name: 'Canzone',
  description: 'Descrizione',
  imageUrl: 'https://images.example.test/item.jpg',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  customValues: { genere: 'pop' },
  position: 1,
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
}

describe('ElementCard', () => {
  it('mostra immagine e valori ma non carica il video prima del tap', () => {
    const wrapper = mount(ElementCard, { props: { element: ELEMENT } })

    expect(wrapper.get('img').attributes('src')).toBe(ELEMENT.imageUrl)
    expect(wrapper.text()).toContain('Canzone')
    expect(wrapper.text()).toContain('genere')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('button').text()).toBe('Riproduci video')
  })

  it('carica il video da youtube-nocookie solo dopo il tap', async () => {
    const wrapper = mount(ElementCard, { props: { element: ELEMENT } })

    await wrapper.get('button').trigger('click')

    const iframe = wrapper.get('iframe')
    expect(iframe.attributes('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(wrapper.text()).not.toContain('Riproduci video')
  })

  it('non offre il video quando l elemento non ne ha uno', () => {
    const wrapper = mount(ElementCard, { props: { element: { ...ELEMENT, videoUrl: null } } })

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Riproduci video')
  })
})
