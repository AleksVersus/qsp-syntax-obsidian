# Подсветка синтаксиса QSP для Obsidian

[English](README.md) | Русский

Этот плагин основан на [примере плагина](https://github.com/obsidianmd/obsidian-sample-plugin) для [Obsidian](https://obsidian.md) и плагине [obsidian-svelte-syntax-highlighter
](https://github.com/typhoon-kim/obsidian-svelte-syntax-highlighter) от Typhoon Kim.

Установка плагина в ваше хранилище в Обсидиане:

1. Найдите папку `.obsidian` в папке вашего Obsidian-хранилища.
2. Перейдите в папку `plugins`
3. Извлеките папку `qsp-syntax-obsidian` из архива, который можно скачать в [последнем релизе](https://github.com/AleksVersus/qsp-syntax-obsidian/releases).
4. Перезапустите Обсидиан
5. В обсидиане откройте **Settings** (Настройки).
6. В боковом меню найдите **Community plugins** (Сторонние плагины).
7. Выберите **Turn on community plugins** (Настройки плагинов).
8. Включите плагин **QSP-syntax highlighting** переключением ползунка рядом с ним.
9. Проверьте работу синтаксиса на этом фрагменте кода:

````
```qsp
local $top_text = $args[0] & ! text from top
local $command = $iif($args[1]<>"", $args[1], "*pl") & ! command for print text
local $screen = $mid($args[1], 1, 1) & ! first symbol from command
local $text = ""
if $screen="*":
	! if fist symbol is *
	! main description wondow
	$text=$maintxt
else
	! addition description window
	$text=$stattxt
end
! use dynamic for run command:
dynamic "
	<<$screen>>clr
	<<$command>> $args[0]
	<<$screen>>p $args[1]
", $top_text, $text
```
````

Если синтаксис не заработал, перезагрузите обсидиан, страницу или начните печатать текст в блоке кода.

- По вопросам пишите на почту: aleksversus@mail.ru
- Подпишитесь на мой бусти: "https://boosty.to/aleksversus",
- Поддержите мои проекты единоразовым платежом: "https://www.donationalerts.com/r/aleksversus"

Огромное спасибо Тайфуну Киму (Typhoon Kim)! Идите на [его страницу](https://github.com/typhoon-kim/obsidian-svelte-syntax-highlighter) и отдайте этому замечательному человеку все свои деньги!!! 
